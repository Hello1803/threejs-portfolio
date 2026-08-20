import * as THREE from 'three';

/*
 * EnvironmentEffects
 *
 * Blender scene:
 *   Sphere      = DAY
 *   NightSphere = NIGHT
 *
 * This version adds:
 *   - smooth day/night environment crossfade
 *   - synchronized HemisphereLight + DirectionalLight transition
 *   - leaves during day
 *   - fireflies during night
 *
 * The original Blender materials are NOT modified directly.
 * Environment materials are cloned once so opacity/depth settings
 * belong only to this effect.
 */

export class EnvironmentEffects {

    constructor(scene, options = {}) {

        this.scene = scene;

        this.dayName = options.dayName ?? 'Sphere';
        this.nightName = options.nightName ?? 'NightSphere';

        this.mode = options.mode ?? 'day';

        this.transitionDuration =
            options.transitionDuration ?? 2.0;

        /*
         * Day HDRI / Sphere brightness.
         *
         * 1.0 = original Blender brightness
         * 0.85 = slightly darker
         * 0.75 = noticeably darker
         * 0.60 = much darker
         *
         * This affects ONLY the day environment material.
         * Scene lighting is unchanged.
         */
        this.dayEnvironmentBrightness =
            options.dayEnvironmentBrightness ?? 0.55;

        this.daySphere = null;
        this.nightSphere = null;

        this.dayEnvironmentMaterial = null;
        this.nightEnvironmentMaterial = null;

        this.hemisphereLight = null;
        this.directionalLight = null;

        /*
         * Capture the original daytime lighting exactly once.
         * Do not recapture after the night transition changes the lights.
         */
        this.lightsCaptured = false;

        this.dayHemisphereIntensity = 5.0;
        this.nightHemisphereIntensity = 3.0;

        this.dayDirectionalIntensity = 5.0;
        this.nightDirectionalIntensity = 3.0;

        this.dayHemisphereSky = new THREE.Color(0xffffff);
        this.nightHemisphereSky = new THREE.Color(0x26314a);

        this.dayHemisphereGround = new THREE.Color(0x444444);
        this.nightHemisphereGround = new THREE.Color(0x080b14);

        this.dayDirectionalColor =
            new THREE.Color(0xffffff);

        this.nightDirectionalColor =
            new THREE.Color(0x7187b8);

        this.transition = {
            active: false,
            progress: this.mode === 'night' ? 1 : 0,
            from: this.mode,
            to: this.mode
        };

        this.time = 0;

        this.leafCount = options.leafCount ?? 45;
        this.fireflyCount = options.fireflyCount ?? 45;
        this.areaRadius = options.areaRadius ?? 12;

        this.minHeight = options.minHeight ?? 0.35;
        this.maxLeafHeight = options.maxLeafHeight ?? 4.0;

        this.minFireflyHeight =
            options.minFireflyHeight ?? 0.6;

        this.maxFireflyHeight =
            options.maxFireflyHeight ?? 3.0;

        this.wind = {
            x: 0.45,
            z: 0.18,
            strength: 0.65
        };

        this.leaves = [];
        this.fireflies = [];

        this.leafGroup = new THREE.Group();
        this.leafGroup.name = 'Environment_Leaves';
        scene.add(this.leafGroup);

        this.fireflyGroup = new THREE.Group();
        this.fireflyGroup.name = 'Environment_Fireflies';
        scene.add(this.fireflyGroup);

        this.createLeaves();
        this.createFireflies();

        this.resolveEnvironment();
        this.resolveLights();

        this.applyState(
            this.mode === 'night' ? 1 : 0
        );

        this._keyHandler = (event) => {

            if (
                event.target instanceof HTMLInputElement ||
                event.target instanceof HTMLTextAreaElement
            ) {
                return;
            }

            const key = event.key.toLowerCase();

            if (key === 'n') {
                this.setMode('night');
            }

            if (key === 'd') {
                this.setMode('day');
            }
        };

        window.addEventListener(
            'keydown',
            this._keyHandler
        );
    }


    // ============================================================
    // ENVIRONMENT
    // ============================================================

    resolveEnvironment() {

        if (!this.daySphere) {
            this.daySphere =
                this.scene.getObjectByName(
                    this.dayName
                );
        }

        if (!this.nightSphere) {
            this.nightSphere =
                this.scene.getObjectByName(
                    this.nightName
                );
        }

        if (
            this.daySphere &&
            this.nightSphere
        ) {
            this.prepareEnvironmentMaterials();
        }
    }


    prepareEnvironmentMaterials() {

        if (
            this.dayEnvironmentMaterial &&
            this.nightEnvironmentMaterial
        ) {
            return;
        }

        /*
         * Blender can export "Sphere" as either:
         *
         *   Mesh
         *
         * or:
         *
         *   Group/Object3D
         *      └── Mesh
         *
         * The previous version only looked at Sphere.material.
         * If Sphere is a Group, that is undefined and the brightness
         * code never reached the actual panorama mesh.
         *
         * Collect the actual mesh materials recursively.
         */
        const getMaterials = (root) => {

            const materials = [];

            root.traverse((object) => {

                if (!object.isMesh || !object.material) {
                    return;
                }

                const list =
                    Array.isArray(object.material)
                        ? object.material
                        : [object.material];

                for (const material of list) {
                    if (material) {
                        materials.push({
                            object,
                            material
                        });
                    }
                }
            });

            return materials;
        };

        const dayEntries =
            getMaterials(this.daySphere);

        const nightEntries =
            getMaterials(this.nightSphere);

        if (
            dayEntries.length === 0 ||
            nightEntries.length === 0
        ) {
            console.warn(
                '[EnvironmentEffects] Could not find mesh materials inside Sphere/NightSphere.'
            );
            return;
        }

        /*
         * Clone the actual mesh materials.
         * Original Blender materials remain untouched.
         */
        this.dayEnvironmentMaterial =
            dayEntries.map((entry) => ({
                object: entry.object,
                original: entry.material,
                material: entry.material.clone()
            }));

        this.nightEnvironmentMaterial =
            nightEntries.map((entry) => ({
                object: entry.object,
                original: entry.material,
                material: entry.material.clone()
            }));

        /*
         * Apply the cloned materials to the actual child meshes.
         */
        for (const entry of this.dayEnvironmentMaterial) {
            entry.object.material =
                entry.material;
        }

        for (const entry of this.nightEnvironmentMaterial) {
            entry.object.material =
                entry.material;
        }

        /*
         * Darken ONLY the DAY panorama.
         *
         * This is applied in the material shader rather than only
         * changing material.color. That is important for Blender
         * materials where the panorama texture/emissive contribution
         * can dominate the final pixel color.
         *
         * 1.00 = original
         * 0.75 = moderately darker
         * 0.50 = half brightness
         * 0.05 = almost black
         */
        const dayBrightness =
            THREE.MathUtils.clamp(
                this.dayEnvironmentBrightness,
                0,
                1
            );

        for (
            const entry of this.dayEnvironmentMaterial
        ) {

            const material = entry.material;

            material.transparent = true;
            material.depthTest = true;
            material.depthWrite = false;

            /*
             * Force the multiplier onto the final fragment color.
             * This affects the visible panorama regardless of whether
             * its material is MeshBasicMaterial, MeshStandardMaterial,
             * or another built-in Three.js material using a map.
             */
            material.onBeforeCompile = (shader) => {

                shader.uniforms.uDayEnvironmentBrightness =
                    { value: this.dayEnvironmentBrightness };

                material.userData.environmentBrightnessShader =
                    shader.uniforms.uDayEnvironmentBrightness;

                shader.fragmentShader =
                    'uniform float uDayEnvironmentBrightness;\n' +
                    shader.fragmentShader;

                shader.fragmentShader =
                    shader.fragmentShader.replace(
                        '#include <dithering_fragment>',
                        'gl_FragColor.rgb *= uDayEnvironmentBrightness;\n' +
                        '#include <dithering_fragment>'
                    );
            };

            material.customProgramCacheKey = () =>
                `day-environment-brightness-${dayBrightness}`;
        }

        for (
            const entry of this.nightEnvironmentMaterial
        ) {

            entry.material.transparent = true;
            entry.material.depthTest = true;
            entry.material.depthWrite = false;
        }

        /*
         * Keep the environment objects rendering before normal scene
         * geometry.
         */
        this.daySphere.traverse((object) => {
            if (object.isMesh) {
                object.renderOrder = -1000;
            }
        });

        this.nightSphere.traverse((object) => {
            if (object.isMesh) {
                object.renderOrder = -999;
            }
        });

        console.info(
            '[EnvironmentEffects] Environment materials prepared:',
            {
                dayMeshes: this.dayEnvironmentMaterial.length,
                nightMeshes: this.nightEnvironmentMaterial.length,
                dayBrightness:
                    this.dayEnvironmentBrightness
            }
        );

        this.applyEnvironmentOpacity(
            this.mode === 'night' ? 0 : 1,
            this.mode === 'night' ? 1 : 0
        );
    }

    setDayEnvironmentBrightness(value) {

        this.dayEnvironmentBrightness =
            THREE.MathUtils.clamp(
                value,
                0,
                1
            );

        if (!this.dayEnvironmentMaterial) {
            return;
        }

        for (
            const entry of this.dayEnvironmentMaterial
        ) {

            const material = entry.material;

            /*
             * onBeforeCompile runs when the shader is compiled.
             * If it has already compiled, update the existing uniform.
             */
            const properties =
                material.userData
                    .environmentBrightnessShader;

            if (properties) {
                properties.value =
                    this.dayEnvironmentBrightness;
            }

            material.needsUpdate = true;
        }
    }


    applyEnvironmentOpacity(
        dayAmount,
        nightAmount
    ) {

        const setOpacity = (
            entries,
            amount
        ) => {

            if (!entries) {
                return;
            }

            const opacity =
                THREE.MathUtils.clamp(
                    amount,
                    0,
                    1
                );

            for (const entry of entries) {
                entry.material.opacity =
                    opacity;
            }
        };

        if (
            this.daySphere
        ) {
            this.daySphere.visible =
                dayAmount > 0.001;
        }

        if (
            this.nightSphere
        ) {
            this.nightSphere.visible =
                nightAmount > 0.001;
        }

        setOpacity(
            this.dayEnvironmentMaterial,
            dayAmount
        );

        setOpacity(
            this.nightEnvironmentMaterial,
            nightAmount
        );
    }

    // ============================================================
    // LIGHTS
    // ============================================================

    resolveLights() {

        /*
         * IMPORTANT:
         *
         * update() calls resolveLights() every frame because the
         * environment GLB may be asynchronous.
         *
         * However, the DAY light values must only be captured once.
         * Otherwise the current NIGHT values overwrite the original
         * DAY baseline and DAY -> NIGHT -> DAY cannot recover.
         */
        if (this.lightsCaptured) {
            return;
        }

        if (
            !this.hemisphereLight ||
            !this.directionalLight
        ) {

            this.scene.traverse((object) => {

                if (
                    !this.hemisphereLight &&
                    object.isHemisphereLight
                ) {
                    this.hemisphereLight =
                        object;
                }

                if (
                    !this.directionalLight &&
                    object.isDirectionalLight
                ) {
                    this.directionalLight =
                        object;
                }
            });
        }

        /*
         * Wait until both lights exist.
         */
        if (
            !this.hemisphereLight ||
            !this.directionalLight
        ) {
            return;
        }

        /*
         * Capture the actual values from the scene ONCE.
         *
         * This means if you later tune the lights in main.js,
         * those tuned daytime values become the restore point.
         */
        this.dayHemisphereIntensity =
            this.hemisphereLight.intensity;

        this.dayHemisphereSky.copy(
            this.hemisphereLight.color
        );

        this.dayHemisphereGround.copy(
            this.hemisphereLight.groundColor
        );

        this.dayDirectionalIntensity =
            this.directionalLight.intensity;

        this.dayDirectionalColor.copy(
            this.directionalLight.color
        );

        this.lightsCaptured = true;

        console.info(
            '[EnvironmentEffects] Day lighting baseline captured:',
            {
                hemisphereIntensity:
                    this.dayHemisphereIntensity,
                directionalIntensity:
                    this.dayDirectionalIntensity
            }
        );
    }

    applyLightState(nightAmount) {

        if (this.hemisphereLight) {

            this.hemisphereLight.intensity =
                THREE.MathUtils.lerp(
                    this.dayHemisphereIntensity,
                    this.nightHemisphereIntensity,
                    nightAmount
                );

            this.hemisphereLight.color.copy(
                this.dayHemisphereSky
            ).lerp(
                this.nightHemisphereSky,
                nightAmount
            );

            this.hemisphereLight.groundColor.copy(
                this.dayHemisphereGround
            ).lerp(
                this.nightHemisphereGround,
                nightAmount
            );
        }

        if (this.directionalLight) {

            this.directionalLight.intensity =
                THREE.MathUtils.lerp(
                    this.dayDirectionalIntensity,
                    this.nightDirectionalIntensity,
                    nightAmount
                );

            this.directionalLight.color.copy(
                this.dayDirectionalColor
            ).lerp(
                this.nightDirectionalColor,
                nightAmount
            );
        }
    }


    // ============================================================
    // DAY / NIGHT
    // ============================================================

    setMode(mode, instant = false) {

        if (
            mode !== 'day' &&
            mode !== 'night'
        ) {
            return;
        }

        this.resolveEnvironment();
        this.resolveLights();

        if (instant) {

            this.mode = mode;

            this.transition.active = false;

            const amount =
                mode === 'night' ? 1 : 0;

            this.applyState(amount);

            return;
        }

        if (
            mode === this.mode &&
            !this.transition.active
        ) {
            return;
        }

        this.transition.active = true;
        this.transition.from = this.mode;
        this.transition.to = mode;
        this.transition.progress = 0;
    }


    toggleDayNight(instant = false) {

        this.setMode(
            this.mode === 'day'
                ? 'night'
                : 'day',
            instant
        );
    }


    applyState(nightAmount) {

        const dayAmount =
            1 - nightAmount;

        this.applyEnvironmentOpacity(
            dayAmount,
            nightAmount
        );

        this.applyLightState(
            nightAmount
        );

        this.applyParticleState(
            nightAmount
        );
    }


    updateTransition(delta) {

        if (!this.transition.active) {
            return;
        }

        this.transition.progress +=
            delta /
            this.transitionDuration;

        const t =
            Math.min(
                this.transition.progress,
                1
            );

        /*
         * Smoothstep gives a less mechanical transition than linear.
         */
        const smooth =
            t * t * (3 - 2 * t);

        const nightAmount =
            this.transition.to === 'night'
                ? smooth
                : 1 - smooth;

        this.applyState(
            nightAmount
        );

        if (t >= 1) {

            this.mode =
                this.transition.to;

            this.transition.active = false;

            this.applyState(
                this.mode === 'night'
                    ? 1
                    : 0
            );
        }
    }


    // ============================================================
    // PARTICLES
    // ============================================================

    applyParticleState(nightAmount) {

        const dayAmount =
            1 - nightAmount;

        if (this.leafMesh) {

            this.leafMesh.material.opacity =
                dayAmount;

            this.leafGroup.visible =
                dayAmount > 0.001;
        }

        if (this.fireflyPoints) {

            this.fireflyPoints.material.opacity =
                nightAmount * 10;

            this.fireflyGroup.visible =
                nightAmount > 0.001;
        }
    }


    // ============================================================
    // LEAVES
    // ============================================================

    createLeafGeometry() {

        const shape = new THREE.Shape();

        shape.moveTo(0.00, 0.100);    // top tip
        shape.lineTo(0.045, 0.042);
        shape.lineTo(0.082, -0.012);  // right point
        shape.lineTo(0.025, -0.085);
        shape.lineTo(-0.038, -0.072);
        shape.lineTo(-0.078, -0.005); // left point
        shape.lineTo(-0.042, 0.058);
        shape.closePath();

        const geometry =
            new THREE.ShapeGeometry(shape);

        geometry.center();

        return geometry;
    }


    createLeaves() {

        const material =
            new THREE.MeshBasicMaterial({
                color: 0x236b26,
                transparent: true,
                opacity: 1,
                depthWrite: false,
                side: THREE.DoubleSide
            });

        this.leafMesh =
            new THREE.InstancedMesh(
                this.createLeafGeometry(),
                material,
                this.leafCount
            );

        this.leafMesh.name =
            'FallingLeaves';

        this.leafMesh.frustumCulled = false;

        this.leafGroup.add(
            this.leafMesh
        );

        const dummy =
            new THREE.Object3D();

        for (
            let i = 0;
            i < this.leafCount;
            i++
        ) {

            const leaf = {

                x:
                    (Math.random() * 2 - 1) *
                    this.areaRadius,

                y:
                    this.minHeight +
                    Math.random() *
                    (
                        this.maxLeafHeight -
                        this.minHeight
                    ),

                z:
                    (Math.random() * 2 - 1) *
                    this.areaRadius,

                fallSpeed:
                    0.10 +
                    Math.random() * 0.16,

                drift:
                    0.12 +
                    Math.random() * 0.25,

                phase:
                    Math.random() *
                    Math.PI * 2,

                rotationSpeed:
                    (Math.random() * 2 - 1) *
                    1.5,

                scale:
                    0.8 +
                    Math.random() * 0.7
            };

            this.leaves.push(leaf);

            dummy.position.set(
                leaf.x,
                leaf.y,
                leaf.z
            );

            dummy.rotation.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
            );

            dummy.scale.setScalar(
                leaf.scale
            );

            dummy.updateMatrix();

            this.leafMesh.setMatrixAt(
                i,
                dummy.matrix
            );
        }

        this.leafMesh.instanceMatrix.needsUpdate =
            true;
    }


    resetLeaf(leaf) {

        leaf.x =
            (Math.random() * 2 - 1) *
            this.areaRadius;

        leaf.y =
            this.maxLeafHeight +
            Math.random() * 1.5;

        leaf.z =
            (Math.random() * 2 - 1) *
            this.areaRadius;

        leaf.phase =
            Math.random() *
            Math.PI * 2;
    }


    updateLeaves(delta) {

        if (!this.leafMesh) {
            return;
        }

        const dummy =
            new THREE.Object3D();

        for (
            let i = 0;
            i < this.leaves.length;
            i++
        ) {

            const leaf =
                this.leaves[i];

            leaf.y -=
                leaf.fallSpeed *
                delta;

            const swayTime =
                this.time *
                (0.8 + leaf.drift);

            leaf.x +=
                this.wind.x *
                this.wind.strength *
                delta *
                0.12;

            leaf.z +=
                this.wind.z *
                this.wind.strength *
                delta *
                0.12;

            leaf.x +=
                Math.sin(
                    swayTime +
                    leaf.phase
                ) *
                leaf.drift *
                delta;

            leaf.z +=
                Math.cos(
                    swayTime * 0.8 +
                    leaf.phase
                ) *
                leaf.drift *
                delta;

            if (
                leaf.y < this.minHeight ||
                Math.abs(leaf.x) >
                    this.areaRadius * 1.35 ||
                Math.abs(leaf.z) >
                    this.areaRadius * 1.35
            ) {
                this.resetLeaf(leaf);
            }

            dummy.position.set(
                leaf.x,
                leaf.y,
                leaf.z
            );

            dummy.rotation.set(
                swayTime * 0.25,
                swayTime * 0.35,
                swayTime *
                    leaf.rotationSpeed
            );

            dummy.scale.setScalar(
                leaf.scale
            );

            dummy.updateMatrix();

            this.leafMesh.setMatrixAt(
                i,
                dummy.matrix
            );
        }

        this.leafMesh.instanceMatrix.needsUpdate =
            true;
    }


    // ============================================================
    // FIREFLIES
    // ============================================================

    createFireflies() {

        const geometry =
            new THREE.BufferGeometry();

        const positions =
            new Float32Array(
                this.fireflyCount * 3
            );

        const colors =
            new Float32Array(
                this.fireflyCount * 3
            );

        const material =
            new THREE.PointsMaterial({
                color: 0xffffcc,
                size: 0.03,
                transparent: true,
                opacity: 0,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                sizeAttenuation: true
            });

        for (
            let i = 0;
            i < this.fireflyCount;
            i++
        ) {

            const firefly = {

                x:
                    (Math.random() * 2 - 1) *
                    this.areaRadius,

                y:
                    this.minFireflyHeight +
                    Math.random() *
                    (
                        this.maxFireflyHeight -
                        this.minFireflyHeight
                    ),

                z:
                    (Math.random() * 2 - 1) *
                    this.areaRadius,

                phase:
                    Math.random() *
                    Math.PI * 2,

                speed:
                    0.25 +
                    Math.random() * 0.45,

                amplitude:
                    0.15 +
                    Math.random() * 0.25
            };

            this.fireflies.push(
                firefly
            );

            const p = i * 3;

            positions[p] =
                firefly.x;

            positions[p + 1] =
                firefly.y;

            positions[p + 2] =
                firefly.z;

            colors[p] = 1;
            colors[p + 1] = 0.85;
            colors[p + 2] = 0.35;
        }

        geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(
                positions,
                3
            )
        );

        geometry.setAttribute(
            'color',
            new THREE.BufferAttribute(
                colors,
                3
            )
        );

        material.vertexColors = true;

        this.fireflyPoints =
            new THREE.Points(
                geometry,
                material
            );

        this.fireflyPoints.name =
            'Fireflies';

        this.fireflyPoints.frustumCulled = false;

        this.fireflyGroup.add(
            this.fireflyPoints
        );
    }


    updateFireflies(delta) {

        if (!this.fireflyPoints) {
            return;
        }

        const position =
            this.fireflyPoints.geometry
                .getAttribute('position');

        for (
            let i = 0;
            i < this.fireflies.length;
            i++
        ) {

            const firefly =
                this.fireflies[i];

            firefly.phase +=
                firefly.speed *
                delta;

            const p = i * 3;

            position.array[p] =
                firefly.x +
                Math.sin(
                    this.time * 0.35 +
                    firefly.phase
                ) *
                firefly.amplitude;

            position.array[p + 1] =
                firefly.y +
                Math.sin(
                    this.time * 0.7 +
                    firefly.phase * 1.7
                ) *
                firefly.amplitude;

            position.array[p + 2] =
                firefly.z +
                Math.cos(
                    this.time * 0.3 +
                    firefly.phase
                ) *
                firefly.amplitude;
        }

        position.needsUpdate = true;
    }


    // ============================================================
    // WIND
    // ============================================================

    setWind(x, z, strength = 1) {

        this.wind.x = x;
        this.wind.z = z;
        this.wind.strength = strength;
    }


    // ============================================================
    // UPDATE
    // ============================================================

    update(delta) {

        this.time += delta;

        this.resolveEnvironment();
        this.resolveLights();

        this.updateLeaves(delta);
        this.updateFireflies(delta);

        this.updateTransition(delta);
    }


    // ============================================================
    // CLEANUP
    // ============================================================

    dispose() {

        this.leafMesh?.geometry.dispose();
        this.leafMesh?.material.dispose();

        this.fireflyPoints?.geometry.dispose();
        this.fireflyPoints?.material.dispose();

        /*
         * Restore the original Blender materials on every environment
         * mesh before disposing the effect-owned clones.
         */
        if (this.dayEnvironmentMaterial) {

            for (const entry of this.dayEnvironmentMaterial) {
                entry.object.material =
                    entry.original;

                entry.material.dispose();
            }
        }

        if (this.nightEnvironmentMaterial) {

            for (const entry of this.nightEnvironmentMaterial) {
                entry.object.material =
                    entry.original;

                entry.material.dispose();
            }
        }

        this.scene.remove(this.leafGroup);
        this.scene.remove(this.fireflyGroup);

        if (this._keyHandler) {
            window.removeEventListener(
                'keydown',
                this._keyHandler
            );
        }
    }
}
