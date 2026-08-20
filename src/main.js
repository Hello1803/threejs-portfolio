import * as THREE from 'three';

import {
    GLTFLoader
} from 'three/addons/loaders/GLTFLoader.js';

import {
    HTMLMesh
} from 'three/addons/interactive/HTMLMesh.js';

import {
    InteractiveGroup
} from 'three/addons/interactive/InteractiveGroup.js';

import {
    CCDIKSolver
} from 'three/addons/animation/CCDIKSolver.js';

import {
    EffectComposer
} from 'three/addons/postprocessing/EffectComposer.js';

import {
    RenderPass
} from 'three/addons/postprocessing/RenderPass.js';

import {
    UnrealBloomPass
} from 'three/addons/postprocessing/UnrealBloomPass.js';

import {
    OutputPass
} from 'three/addons/postprocessing/OutputPass.js';

import { EnvironmentEffects } from './environment-effects.js';


// ============================================================
// SCENE
// ============================================================

const scene =
    new THREE.Scene();

scene.background =
    new THREE.Color(0x222222);


// --------------------------------------------------------
// Fog. Placeholder distances — tune these once the new
// outdoor/landscape scene is in, since the right near/far
// depends entirely on how large that scene is. Kept far
// enough out for now that it shouldn't visibly affect the
// current room. Linear (near/far) rather than exponential,
// since it's easier to reason about by eye — swap to
// THREE.FogExp2(color, density) here if an exponential
// falloff ends up looking better for the landscape.
// --------------------------------------------------------

const FOG_COLOR = 0x222222;

const FOG_NEAR = 15;

const FOG_FAR = 60;

scene.fog =
    new THREE.Fog(
        FOG_COLOR,
        FOG_NEAR,
        FOG_FAR
    );


// ============================================================
// CAMERA
// ============================================================

// --------------------------------------------------------
// Field of view — widens for general navigation, narrows
// (zooms in) automatically while looking at the iPad screen
// so the portfolio content is readable.
// --------------------------------------------------------

const NORMAL_FOV = 60;

const ZOOM_FOV = 48;

let targetFov = NORMAL_FOV;


const camera =
    new THREE.PerspectiveCamera(
        NORMAL_FOV,
        window.innerWidth /
            window.innerHeight,
        0.01,
        1000
    );

camera.position.set(
    0,
    1.5,
    5
);

camera.rotation.order =
    'YXZ';


// ============================================================
// RENDERER
// ============================================================

const renderer =
    new THREE.WebGLRenderer({
        antialias: true
    });

renderer.setSize(
    window.innerWidth,
    window.innerHeight
);

renderer.setPixelRatio(
    Math.min(
        window.devicePixelRatio,
        2
    )
);

renderer.outputColorSpace =
    THREE.SRGBColorSpace;

renderer.shadowMap.enabled =
    true;

document.body.appendChild(
    renderer.domElement
);

// Without this, the browser's own touch-gesture recognizer
// (page scroll, pull-to-refresh, pinch-zoom) competes with our
// pointer handlers below. On mobile specifically, once it
// decides to take over a gesture it fires pointercancel — which
// is what was causing camera-look to move a little, stop, and
// need a fresh touch to continue. This tells the browser JS has
// full control of touch on the canvas, so it never intervenes.
renderer.domElement.style.touchAction =
    'none';


// ============================================================
// CONTROLS HINT
// ============================================================
//
// A brief on-screen reminder of the controls, shown in the top
// corner on load and faded out after a few seconds. Pure DOM/CSS,
// entirely independent of the 3D scene — safe regardless of
// what's in environment-effects.js.

(function setupControlsHint() {

    const isTouchDevice =
        ('ontouchstart' in window) ||
        navigator.maxTouchPoints > 0;

    const hintText =
        isTouchDevice
            ? 'Drag to look around · Tap the iPad to interact'
            : 'Right-click + drag to look around · Click to interact';


    const style =
        document.createElement('style');

    style.textContent = `
        #controls-hint {
            position: fixed;
            top: 16px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 1000;
            padding: 8px 16px;
            border-radius: 999px;
            background: rgba(0, 0, 0, 0.55);
            backdrop-filter: blur(6px);
            color: #fff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
                Inter, sans-serif;
            font-size: 13px;
            letter-spacing: 0.01em;
            white-space: nowrap;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.6s ease;
        }

        #controls-hint.visible {
            opacity: 1;
        }

        @media (max-width: 520px) {
            #controls-hint {
                top: 12px;
                font-size: 11.5px;
                padding: 7px 12px;
                max-width: 90vw;
                white-space: normal;
                text-align: center;
            }
        }
    `;

    document.head.appendChild(style);


    const hint =
        document.createElement('div');

    hint.id = 'controls-hint';

    hint.textContent = hintText;

    document.body.appendChild(hint);


    // Fade in on the next frame (so the transition actually
    // animates instead of snapping straight to visible).
    requestAnimationFrame(() => {

        requestAnimationFrame(() => {

            hint.classList.add('visible');

        });

    });


    const VISIBLE_DURATION_MS = 4500;

    const FADE_DURATION_MS = 600;

    setTimeout(() => {

        hint.classList.remove('visible');

        setTimeout(() => {

            hint.remove();

        }, FADE_DURATION_MS);

    }, VISIBLE_DURATION_MS);

})();


// ============================================================
// POST-PROCESSING
// ============================================================
//
// Bloom is set up now so it's ready to go once the new outdoor
// scene (with actual emissive materials — sky, fireflies, etc.)
// is dropped in. With the current room, nothing in the scene is
// bright enough to cross the threshold below, so this is
// currently a no-op visually — safe to leave on.
//
// ENABLE_POST_PROCESSING is a single kill switch: bloom is a
// genuinely more expensive render path (multiple downsample/blur
// passes every frame), worth watching on the iPad specifically —
// flip this to false to fall back to a plain renderer.render()
// if it turns out to cost too much there.

const ENABLE_POST_PROCESSING = true;

const BLOOM_STRENGTH = 0.05;

const BLOOM_RADIUS = 0.3;

// How bright (0–1, post-tonemapping) a pixel needs to be before
// it blooms. High on purpose for now — only real point-light-like
// things (fireflies, a sun disc) should cross this, not general
// scene brightness. Lower it once real emissive materials exist
// to tune against.
const BLOOM_THRESHOLD = 0.8;


const composer =
    new EffectComposer(renderer);

composer.addPass(
    new RenderPass(scene, camera)
);

const bloomPass =
    new UnrealBloomPass(
        new THREE.Vector2(
            window.innerWidth,
            window.innerHeight
        ),
        BLOOM_STRENGTH,
        BLOOM_RADIUS,
        BLOOM_THRESHOLD
    );

composer.addPass(bloomPass);

composer.addPass(
    new OutputPass()
);


// ============================================================
// INTERACTIVE GROUP
// ============================================================
//
// Forwards real pointer events (mouse AND touch — this is the
// part that makes the iPad screen actually clickable/tappable
// on iPad/touch devices, not just hover-detectable) to the
// HTMLMesh's underlying DOM element.

const interactiveGroup =
    new InteractiveGroup();

interactiveGroup.listenToPointerEvents(
    renderer,
    camera
);

// Parented onto the iPad's screen bone once the model loads
// (see createPortfolioHTMLMesh below), so it follows the
// character's animation instead of staying fixed in world space.


// ============================================================
// LIGHTING
// ============================================================

const ambientLight =
    new THREE.HemisphereLight(
        0xffffff,
        0x444444,
        5
    );

scene.add(
    ambientLight
);


const directionalLight =
    new THREE.DirectionalLight(
        0xffffff,
        2
    );

directionalLight.position.set(
    5,
    10,
    5
);

directionalLight.castShadow =
    false;

scene.add(
    directionalLight
);


// ============================================================
// CLOCK / ANIMATION
// ============================================================

const clock =
    new THREE.Clock();

let mixer = null;

// ============================================================
// ENVIRONMENT EFFECTS
// ============================================================
// Isolated decorative effects. This does not alter the existing
// camera, iPad, HTMLMesh, IK, lighting, or portfolio logic.
const environmentEffects = new EnvironmentEffects(scene, {
    leafCount: 45,
    fireflyCount: 45,
    areaRadius: 12
});

// N / D keys already work (bound inside EnvironmentEffects
// itself) but have no touch equivalent — Android/iOS have no
// keyboard visible by default. This button calls the exact same
// setMode()/toggleDayNight() the keys use, so it can never drift
// out of sync with what N/D do.

(function setupDayNightButton() {

    const style =
        document.createElement('style');

    style.textContent = `
        #day-night-toggle {
            position: fixed;
            top: 16px;
            right: 16px;
            z-index: 1000;
            width: 42px;
            height: 42px;
            border-radius: 50%;
            border: none;
            background: rgba(0, 0, 0, 0.55);
            backdrop-filter: blur(6px);
            color: #fff;
            font-size: 18px;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
        }

        #day-night-toggle:active {
            transform: scale(0.92);
        }

        @media (max-width: 520px) {
            #day-night-toggle {
                top: 12px;
                right: 12px;
                width: 38px;
                height: 38px;
                font-size: 16px;
            }
        }
    `;

    document.head.appendChild(style);


    const button =
        document.createElement('button');

    button.id = 'day-night-toggle';

    button.type = 'button';

    // Shows the icon of the mode tapping will switch TO — same
    // convention most light/dark toggles use.
    function updateIcon() {

        button.textContent =
            environmentEffects.mode === 'day'
                ? '🌙'
                : '☀️';

        button.setAttribute(
            'aria-label',
            environmentEffects.mode === 'day'
                ? 'Switch to night'
                : 'Switch to day'
        );

    }

    updateIcon();

    button.addEventListener('click', () => {

        environmentEffects.toggleDayNight();

        updateIcon();

    });

    document.body.appendChild(button);

})();

// Later, the day/night system can call:
// environmentEffects.setMode('day');
// environmentEffects.setMode('night');



// ============================================================
// CAMERA CONTROL
// ============================================================

let yaw = 0;

let pitch = 0;

let initialYaw = 0;


const MOUSE_SENSITIVITY =
    0.002;


const MAX_YAW =
    THREE.MathUtils.degToRad(50);


const MAX_PITCH =
    THREE.MathUtils.degToRad(50);


// ============================================================
// RAYCASTER
// ============================================================

const raycaster =
    new THREE.Raycaster();

const mouse =
    new THREE.Vector2();


// ============================================================
// OBJECT REFERENCES
// ============================================================

let ipad = null;

let ipadScreen = null;

let head = null;

// The exact plane real clicks are raycast against (inside
// InteractiveGroup). The debug dot, FOV-zoom trigger, and
// finger-IK target all key off THIS object now, instead of the
// separate `ipad` bezel mesh — using two different raycast
// targets was why the dot and the actual click point disagreed.
let portfolioScreenMesh = null;

// The actual detached DOM element HTMLMesh is drawing from.
// Needed to manually drive scrolling — see the wheel/touch-drag
// handlers below. Neither InteractiveGroup nor HTMLMesh have any
// built-in concept of scroll: InteractiveGroup only ever forwards
// pointerdown/up/move, mousedown/up/move and click, never wheel;
// and HTMLMesh only redraws on DOM mutations (attributes/
// children/text), which scrollTop isn't, so a redraw has to be
// requested manually too.
let portfolioDomElement = null;


// ============================================================
// FINGER IK STATE
// ============================================================
//
// Experimental: makes the right hand's index finger reach out
// and track the point the camera is looking at on the iPad
// screen. Built with CCDIKSolver against the Mixamo skeleton
// baked into portfolio-room.glb. Every lookup is guarded, so if
// the rig ever changes/doesn't match, this quietly no-ops
// instead of breaking the rest of the scene.

let ikSolver = null;

let ikTargetBone = null;

let ikReady = false;

let fingerTipBone = null;

let shoulderBone = null;

let armChainBones = [];

let maxArmReach = 0;

// Each entry: { link, boneIndex, half }. "half" is the allowed
// swing in each direction — the actual rotationMin/Max on `link`
// get centered on the bone's real rest-pose rotation once that's
// known (see activateFingerIK), rather than centered on zero.
let ikLinkRanges = [];

let ikSkeleton = null;

let ikRestPosition = new THREE.Vector3();

let ikDesiredPosition = new THREE.Vector3();


// ============================================================
// IPAD STATE
// ============================================================

let isHoveringIpad =
    false;

const lastIpadHitPoint =
    new THREE.Vector3();

// Note: there used to be a visible red "hit marker" sphere here
// for debugging. It's been removed — isHoveringIpad and
// lastIpadHitPoint (computed straight from the raycast each
// frame, below) already drive the FOV zoom and finger IK
// directly; no separate on-screen dot is needed, and it was an
// extra thing that could visually drift out of sync during the
// FOV transition.


// ============================================================
// LOAD GLB
// ============================================================

const loader =
    new GLTFLoader();

loader.load(

    new URL(
        './models/Landscape.glb',
        import.meta.url
    ).href,


    // ========================================================
    // LOADED
    // ========================================================

    (gltf) => {

        const model =
            gltf.scene;

        scene.add(
            model
        );


        // ----------------------------------------------------
        // Animation
        // ----------------------------------------------------

        mixer =
            new THREE.AnimationMixer(
                model
            );


        const sittingClip =
            gltf.animations.find(
                (clip) =>
                    clip.name ===
                    'Sittingpose'
            );


        if (sittingClip) {

            const sittingAction =
                mixer.clipAction(
                    sittingClip
                );

            sittingAction.setLoop(
                THREE.LoopOnce,
                1
            );

            sittingAction.clampWhenFinished =
                true;

            sittingAction.play();


            mixer.addEventListener(
                'finished',
                () => {

                    positionCameraAtHead();

                    activateFingerIK();

                }
            );

        }


        // ----------------------------------------------------
        // iPad
        // ----------------------------------------------------

        ipad =
            model.getObjectByName(
                'Ipad'
            );


        // ----------------------------------------------------
        // Separate screen
        // ----------------------------------------------------

        ipadScreen =
            model.getObjectByName(
                'ipad_screen'
            );


        // ----------------------------------------------------
        // Head
        // ----------------------------------------------------

        head =
            model.getObjectByName(
                'mixamorigHead'
            );


        // ----------------------------------------------------
        // Finger IK (experimental, safely no-ops if it fails)
        // ----------------------------------------------------

        try {

            setupFingerIK(model);

        } catch (error) {

            console.warn(
                'Finger IK setup failed, skipping:',
                error
            );

        }


        // ----------------------------------------------------
        // Create portfolio HTMLMesh
        // ----------------------------------------------------

        if (ipadScreen) {

            createPortfolioHTMLMesh(
                ipadScreen
            ).catch((error) => {

                console.error(
                    'Failed to load portfolio:',
                    error
                );

            });

        }


        // ----------------------------------------------------
        // If there is no sitting animation
        // ----------------------------------------------------

        if (!sittingClip) {

            positionCameraAtHead();

            activateFingerIK();

        }

    },


    undefined,


    (error) => {

        console.error(
            'Failed to load GLB:',
            error
        );

    }

);


// ============================================================
// CAMERA POSITION
// ============================================================

function positionCameraAtHead() {

    if (!head) {

        return;

    }


    // --------------------------------------------------------
    // Update skeleton
    // --------------------------------------------------------

    head.updateWorldMatrix(
        true,
        false
    );


    // --------------------------------------------------------
    // Position
    // --------------------------------------------------------

    const headPosition =
        new THREE.Vector3();

    head.getWorldPosition(
        headPosition
    );


    // --------------------------------------------------------
    // Rotation
    // --------------------------------------------------------

    const headQuaternion =
        new THREE.Quaternion();

    head.getWorldQuaternion(
        headQuaternion
    );


    // --------------------------------------------------------
    // Forward
    // --------------------------------------------------------

    const forward =
        new THREE.Vector3(
            0,
            0,
            1
        );

    forward.applyQuaternion(
        headQuaternion
    );


    // --------------------------------------------------------
    // Your calibrated camera position
    // --------------------------------------------------------

    camera.position.copy(
        headPosition
    );

    camera.position.y +=
        0.3;

    camera.position.z +=
        0.3;


    // --------------------------------------------------------
    // Initial yaw
    // --------------------------------------------------------

    initialYaw =
        Math.atan2(
            -forward.x,
            -forward.z
        );


    yaw =
        initialYaw;

    pitch =
        0;


    camera.rotation.order =
        'YXZ';

    camera.rotation.y =
        yaw;

    camera.rotation.x =
        pitch;

}


// ============================================================
// FINGER IK SETUP
// ============================================================

function setupFingerIK(model) {

    // --------------------------------------------------------
    // Any skinned mesh sharing the character's skeleton works —
    // "Body" is the one baked into this rig.
    // --------------------------------------------------------

    const skinnedMesh =
        model.getObjectByName('Body');

    if (!skinnedMesh || !skinnedMesh.isSkinnedMesh) {

        console.warn(
            'Finger IK: skinned "Body" mesh not found — skipping.'
        );

        return;

    }


    const skeleton =
        skinnedMesh.skeleton;

    ikSkeleton =
        skeleton;

    const boneNames =
        skeleton.bones.map((bone) => bone.name);

    const boneIndex =
        (name) => boneNames.indexOf(name);


    const iArm = boneIndex('mixamorigRightArm');
    const iForeArm = boneIndex('mixamorigRightForeArm');
    const iHand = boneIndex('mixamorigRightHand');
    const iShoulder = boneIndex('mixamorigRightShoulder');
    const iIndex1 = boneIndex('mixamorigRightHandIndex1');
    const iIndex2 = boneIndex('mixamorigRightHandIndex2');
    const iIndex3 = boneIndex('mixamorigRightHandIndex3');
    const iIndex4 = boneIndex('mixamorigRightHandIndex4');


    const requiredBones =
        [iArm, iForeArm, iHand, iShoulder, iIndex1, iIndex2, iIndex3, iIndex4];

    if (requiredBones.some((index) => index === -1)) {

        console.warn(
            'Finger IK: expected right arm/index-finger bones not found — skipping.'
        );

        return;

    }


    // --------------------------------------------------------
    // Remember the fingertip bone. Its resting position is
    // captured later, in activateFingerIK() — capturing it here
    // would grab the bind/T-pose, not the seated pose, which is
    // exactly what was causing the arm to fight the sitting
    // animation and spin erratically.
    // --------------------------------------------------------

    fingerTipBone =
        skeleton.bones[iIndex4];

    shoulderBone =
        skeleton.bones[iShoulder];

    armChainBones = [
        shoulderBone,
        skeleton.bones[iArm],
        skeleton.bones[iForeArm],
        skeleton.bones[iHand],
        skeleton.bones[iIndex1],
        skeleton.bones[iIndex2],
        skeleton.bones[iIndex3],
        fingerTipBone
    ];


    ikTargetBone =
        new THREE.Bone();

    ikTargetBone.name = 'RightIndexIKTarget';

    scene.add(ikTargetBone);


    const targetIndex =
        skeleton.bones.length;

    skeleton.bones.push(ikTargetBone);

    skeleton.boneInverses.push(new THREE.Matrix4());


    // --------------------------------------------------------
    // The finger joints (Index1–3) stay in the chain — CCDIKSolver
    // expects an unbroken parent chain from the effector and
    // warns otherwise — but they're pinned to a hair's-width of
    // rotation, so in practice they stay at their animated pose
    // and don't add extra joints for the solver to flail around
    // (that flailing plus fighting the in-progress sit animation
    // is what caused the earlier "random movement" bug).
    //
    // Shoulder is deliberately NOT a link here — it's the root
    // of the chain, so any rotation there gets amplified by
    // everything below it, making it the single biggest source
    // of an unpredictable/sweeping pose. It stays fixed; reach
    // comes only from Hand/ForeArm/Arm now.
    //
    // rotationMin/Max below are PLACEHOLDERS (0,0,0) — CCDIKSolver
    // clamps a bone's ABSOLUTE local Euler angle to these bounds,
    // not a range relative to wherever the bone currently sits.
    // Centering the real bounds on zero was the bug behind "one
    // corner reaches fine, the other corner doesn't move at all":
    // the seated pose's actual rotation on these bones isn't
    // zero, so a window centered on zero gave lots of headroom on
    // one side and almost none on the other. activateFingerIK()
    // overwrites these in place once the real rest pose is known,
    // centering each window on the bone's actual rest rotation
    // instead. ikLinkRanges (below) records how much swing each
    // link should get in each direction once that happens.
    // --------------------------------------------------------

    const halfRangeIndex3 = new THREE.Vector3(0.05, 0.05, 0.05);
    const halfRangeIndex2 = new THREE.Vector3(0.05, 0.05, 0.05);
    const halfRangeIndex1 = new THREE.Vector3(0.05, 0.05, 0.05);

    // Wrist. Local Y = twist along the forearm's length (locked
    // tight) — X/Z = actual bend (flex/extend, side-bend).
    const halfRangeHand = new THREE.Vector3(0.6, 0.1, 0.6);

    // Elbow. Confirmed from the bind pose: the Hand bone sits
    // almost exactly on ForeArm's local +Y (offset (~0, 0.50,
    // ~0)) — so Y is roll along the forearm, not bend. Locking it
    // near-zero and opening X/Z is what should fix the twisted
    // look. Opened up further since it's doing the reach work the
    // shoulder used to help with.
    const halfRangeForeArm = new THREE.Vector3(1.1, 0.08, 1.1);

    // Upper arm. Same confirmed pattern: ForeArm sits on Arm's
    // local +Y, so Y is twist here too. Also opened up to
    // compensate for the shoulder no longer contributing.
    const halfRangeArm = new THREE.Vector3(1.0, 0.1, 1.0);

    const links = [
        { index: iIndex3, rotationMin: new THREE.Vector3(), rotationMax: new THREE.Vector3() },
        { index: iIndex2, rotationMin: new THREE.Vector3(), rotationMax: new THREE.Vector3() },
        { index: iIndex1, rotationMin: new THREE.Vector3(), rotationMax: new THREE.Vector3() },
        { index: iHand, rotationMin: new THREE.Vector3(), rotationMax: new THREE.Vector3() },
        { index: iForeArm, rotationMin: new THREE.Vector3(), rotationMax: new THREE.Vector3() },
        { index: iArm, rotationMin: new THREE.Vector3(), rotationMax: new THREE.Vector3() }
    ];

    const halfRanges = [
        halfRangeIndex3,
        halfRangeIndex2,
        halfRangeIndex1,
        halfRangeHand,
        halfRangeForeArm,
        halfRangeArm
    ];

    ikLinkRanges = links.map((link, i) => ({
        link,
        boneIndex: link.index,
        half: halfRanges[i]
    }));


    const iks =
        [{
            target: targetIndex,
            effector: iIndex4,
            links: links,
            iteration: 4,
            minAngle: 0.0,
            maxAngle: 0.3
        }];


    ikSolver =
        new CCDIKSolver(
            skinnedMesh,
            iks
        );

}


// ============================================================
// ACTIVATE FINGER IK
// ============================================================
//
// Captures the fingertip's resting position now that the
// character has actually reached its seated pose, and only then
// lets the solver start running. Doing this earlier — while the
// sitting animation was still interpolating the same arm bones —
// was what caused the erratic, seemingly random rotation: the
// IK target was chasing a rest position taken from the bind
// (T-pose) skeleton while the animation kept moving the bones
// underneath it every frame.

function activateFingerIK() {

    if (!fingerTipBone || !ikTargetBone) {

        return;

    }

    fingerTipBone.getWorldPosition(
        ikRestPosition
    );

    ikDesiredPosition.copy(
        ikRestPosition
    );

    ikTargetBone.position.copy(
        ikRestPosition
    );

    ikTargetBone.updateMatrixWorld(true);


    // ----------------------------------------------------------
    // Measure the arm's true max reach from real world-space bone
    // positions. A segment's length between two bones doesn't
    // change with rotation — only its direction does — so summing
    // consecutive gaps along the chain gives the correct fully-
    // extended reach distance even though it's measured at the
    // (elbow-bent) seated pose.
    // ----------------------------------------------------------

    if (armChainBones.length > 1) {

        const pointA = new THREE.Vector3();

        const pointB = new THREE.Vector3();

        let total = 0;

        armChainBones[0].getWorldPosition(pointA);

        for (let i = 1; i < armChainBones.length; i++) {

            armChainBones[i].getWorldPosition(pointB);

            total += pointA.distanceTo(pointB);

            pointA.copy(pointB);

        }

        maxArmReach = total;

    }


    // ----------------------------------------------------------
    // Recenter each link's rotation window on its ACTUAL rest
    // rotation now that the seated pose has settled, instead of
    // the placeholder window centered on zero. This is what fixes
    // "one corner of the screen reaches fine, the other corner
    // doesn't move at all" — a window centered on zero gives
    // wildly unequal headroom in each direction once the bone's
    // real rest angle isn't zero (which, for a seated arm, it
    // never is).
    // ----------------------------------------------------------

    for (const entry of ikLinkRanges) {

        const bone =
            ikSkeleton
                ? ikSkeleton.bones[entry.boneIndex]
                : null;

        if (!bone) {

            continue;

        }

        const rest =
            bone.rotation;

        entry.link.rotationMin.set(
            rest.x - entry.half.x,
            rest.y - entry.half.y,
            rest.z - entry.half.z
        );

        entry.link.rotationMax.set(
            rest.x + entry.half.x,
            rest.y + entry.half.y,
            rest.z + entry.half.z
        );

        // Exact rest quaternion, captured once. The return phase
        // (see updateArmReach) rotates straight back to this,
        // bypassing CCD entirely — CCD is an iterative solver and
        // isn't guaranteed to reconverge to the SAME joint angles
        // it started from (a redundant chain can reach the same
        // end position multiple ways), which is what caused the
        // rest pose to drift slightly after reaching toward some
        // corners and not others.
        entry.bone = bone;

        entry.restQuaternion = bone.quaternion.clone();

    }

    ikReady = true;

}


// ============================================================
// ARM REACH — click-triggered
// ============================================================
//
// Replaces the old continuous/hover-driven IK chase. The arm
// only animates in a short, shaped burst right when a click
// actually lands on the screen, using the EXACT point that
// click hit — the same coordinate the click itself used to
// register the right button, so accuracy comes from reusing
// that number rather than from a second, separately-aimed
// raycast that could disagree with it.

const ARM_REACH_DURATION = 0.3;

const ARM_HOLD_DURATION = 0.4;

const ARM_RETURN_DURATION = 0.35;


let armState = 'idle'; // 'idle' | 'reaching' | 'holding' | 'returning'

let armStateTime = 0;

const armFrom = new THREE.Vector3();

const armTo = new THREE.Vector3();

const tempQuat = new THREE.Quaternion();


function easeOutCubic(t) {

    return 1 - Math.pow(1 - t, 3);

}


function triggerArmReach(worldPoint) {

    if (!ikReady) {

        return;

    }

    armFrom.copy(
        ikTargetBone.position
    );


    // --------------------------------------------------------
    // Same hard limit any IK rig has (Unity's included): the arm
    // physically can't extend past the sum of its segment
    // lengths. Rather than let the solver strain/twist trying to
    // chase an impossible point, clamp the target to the max
    // reachable distance along the same direction — the arm ends
    // up fully, cleanly extended toward it instead.
    // --------------------------------------------------------

    if (shoulderBone && maxArmReach > 0) {

        const shoulderPos =
            new THREE.Vector3();

        shoulderBone.getWorldPosition(shoulderPos);

        const toTarget =
            new THREE.Vector3()
                .subVectors(worldPoint, shoulderPos);

        const distance =
            toTarget.length();


        // A small safety margin — stopping just short of full
        // extension looks like a natural reach; going all the
        // way to 100% tends to look locked-out/stiff.
        const reachLimit =
            maxArmReach * 0.9;

        if (distance > reachLimit) {

            toTarget.setLength(reachLimit);

            armTo
                .copy(shoulderPos)
                .add(toTarget);

        }
        else {

            armTo.copy(worldPoint);

        }

    }
    else {

        armTo.copy(worldPoint);

    }


    armState = 'reaching';

    armStateTime = 0;

}


function updateArmReach(delta) {

    if (armState === 'idle') {

        return;

    }

    armStateTime += delta;

    if (armState === 'reaching') {

        const t =
            Math.min(
                armStateTime / ARM_REACH_DURATION,
                1
            );

        ikTargetBone.position.lerpVectors(
            armFrom,
            armTo,
            easeOutCubic(t)
        );

        if (t >= 1) {

            armState = 'holding';

            armStateTime = 0;

        }

    }
    else if (armState === 'holding') {

        ikTargetBone.position.copy(armTo);

        if (armStateTime >= ARM_HOLD_DURATION) {

            armFrom.copy(armTo);

            armTo.copy(ikRestPosition);

            // Capture exactly where each link bone is right now —
            // the return phase slerps from here, straight to the
            // stored rest quaternion, bypassing CCD entirely.
            for (const entry of ikLinkRanges) {

                if (!entry.bone) {

                    continue;

                }

                if (!entry.returnStartQuaternion) {

                    entry.returnStartQuaternion =
                        new THREE.Quaternion();

                }

                entry.returnStartQuaternion.copy(
                    entry.bone.quaternion
                );

            }

            armState = 'returning';

            armStateTime = 0;

        }

    }
    else if (armState === 'returning') {

        const t =
            Math.min(
                armStateTime / ARM_RETURN_DURATION,
                1
            );

        const eased =
            easeOutCubic(t);

        // Keep the abstract target position drifting back too,
        // purely so armFrom stays sensible if a new click
        // interrupts this return partway through.
        ikTargetBone.position.lerpVectors(
            armFrom,
            armTo,
            eased
        );

        // The actual visual motion: each link bone slerps
        // straight back to its EXACT stored rest quaternion. No
        // CCD involved here, so there's no possibility of
        // reconverging to a slightly different pose depending on
        // which corner it reached toward — it always lands on
        // exactly the same rest pose you posed.
        for (const entry of ikLinkRanges) {

            if (!entry.bone || !entry.returnStartQuaternion) {

                continue;

            }

            tempQuat.copy(
                entry.returnStartQuaternion
            );

            tempQuat.slerp(
                entry.restQuaternion,
                eased
            );

            entry.bone.quaternion.copy(
                tempQuat
            );

        }

        if (t >= 1) {

            ikTargetBone.position.copy(ikRestPosition);

            for (const entry of ikLinkRanges) {

                if (!entry.bone) {

                    continue;

                }

                entry.bone.quaternion.copy(
                    entry.restQuaternion
                );

            }

            armState = 'idle';

            armStateTime = 0;

        }

    }

}


// ============================================================
// HTMLMESH INTERNAL RASTER RESOLUTION
// ============================================================
//
// Logical HTML layout stays 1024x768.
// HTMLMesh's internal canvas is rasterized at 1.5x:
//
//     1024 x 768  ->  1536 x 1152
//
// The canvas drawing context is scaled by the same amount, so
// HTMLMesh's normal drawing code still uses its original CSS-pixel
// coordinates while the browser/Canvas rasterizes those commands
// onto 1.5x more pixels.
//
// The patch is active ONLY while HTMLMesh's synchronous html2canvas()
// routine is running. It is restored immediately afterwards.
// Navigation updates call HTMLTexture.update() synchronously, so the
// same patch is re-enabled for every update.
//
// Physical HTMLMesh size is compensated below, so the iPad does not
// become 1.5x larger.
// ============================================================

const HTML_CAPTURE_SCALE = 1.5;

const _htmlCanvasPrototype =
    HTMLCanvasElement.prototype;

const _htmlWidthDescriptor =
    Object.getOwnPropertyDescriptor(
        _htmlCanvasPrototype,
        'width'
    );

const _htmlHeightDescriptor =
    Object.getOwnPropertyDescriptor(
        _htmlCanvasPrototype,
        'height'
    );

const _htmlGetContext =
    _htmlCanvasPrototype.getContext;

let _htmlCaptureActive = false;
let _htmlCaptureCanvas = null;

function installHTMLCaptureResolutionPatch() {

    if (
        !_htmlWidthDescriptor ||
        !_htmlHeightDescriptor ||
        typeof _htmlWidthDescriptor.set !== 'function' ||
        typeof _htmlHeightDescriptor.set !== 'function'
    ) {
        return;
    }

    Object.defineProperty(
        _htmlCanvasPrototype,
        'width',
        {
            configurable: _htmlWidthDescriptor.configurable,
            enumerable: _htmlWidthDescriptor.enumerable,
            get: _htmlWidthDescriptor.get,

            set(value) {

                if (
                    _htmlCaptureActive &&
                    this === _htmlCaptureCanvas &&
                    typeof value === 'number' &&
                    value > 0
                ) {

                    // The identifying getContext wrapper handles the
                    // high-resolution resize explicitly using the original
                    // setter. Do not multiply an already high-res canvas.
                    value =
                        value >=
                        (1024 * HTML_CAPTURE_SCALE)
                            ? value
                            : value * HTML_CAPTURE_SCALE;

                }

                _htmlWidthDescriptor.set.call(
                    this,
                    value
                );

            }
        }
    );

    Object.defineProperty(
        _htmlCanvasPrototype,
        'height',
        {
            configurable: _htmlHeightDescriptor.configurable,
            enumerable: _htmlHeightDescriptor.enumerable,
            get: _htmlHeightDescriptor.get,

            set(value) {

                if (
                    _htmlCaptureActive &&
                    this === _htmlCaptureCanvas &&
                    typeof value === 'number' &&
                    value > 0
                ) {

                    // Do not multiply an already high-res canvas.
                    value =
                        value >=
                        (768 * HTML_CAPTURE_SCALE)
                            ? value
                            : value * HTML_CAPTURE_SCALE;

                }

                _htmlHeightDescriptor.set.call(
                    this,
                    value
                );

            }
        }
    );

    _htmlCanvasPrototype.getContext =
        function(type, ...args) {

            const context =
                _htmlGetContext.call(
                    this,
                    type,
                    ...args
                );

            if (
                _htmlCaptureActive &&
                this === _htmlCaptureCanvas &&
                type === '2d' &&
                context
            ) {

                context.scale(
                    HTML_CAPTURE_SCALE,
                    HTML_CAPTURE_SCALE
                );

            }

            return context;

        };

}

function removeHTMLCaptureResolutionPatch() {

    Object.defineProperty(
        _htmlCanvasPrototype,
        'width',
        _htmlWidthDescriptor
    );

    Object.defineProperty(
        _htmlCanvasPrototype,
        'height',
        _htmlHeightDescriptor
    );

    _htmlCanvasPrototype.getContext =
        _htmlGetContext;

}

function withHighResolutionHTMLCapture(callback) {

    installHTMLCaptureResolutionPatch();

    _htmlCaptureActive = true;
    _htmlCaptureCanvas = null;

    // The html2canvas implementation creates its canvas after
    // entering this callback. We identify that newly-created canvas
    // from the first 2D getContext call.
    const originalGetContext =
        _htmlCanvasPrototype.getContext;

    // Reinstall a small identifying wrapper on top of the patched
    // getContext. It marks the first canvas that asks for a 2D context.
    _htmlCanvasPrototype.getContext =
        function(type, ...args) {

            if (
                _htmlCaptureCanvas === null &&
                type === '2d'
            ) {

                _htmlCaptureCanvas = this;

                // html2canvas sets width/height BEFORE requesting
                // the context, so the canvas was not identified
                // early enough for those setters. To handle that,
                // the patch also recognizes the first canvas created
                // by observing the 2D context request and applies
                // the scale to its already-created backing store.
                const ctx =
                    _htmlGetContext.call(
                        this,
                        type,
                        ...args
                    );

                if (ctx) {

                    // html2canvas creates a 1024x768 canvas before the
                    // first getContext() call. On later HTMLTexture.update()
                    // calls it reuses that same canvas, which is already
                    // 1536x1152 from the previous capture.
                    //
                    // IMPORTANT: use the ORIGINAL property setters here.
                    // Calling this.width while our patch is active would
                    // multiply the value a second time and produce 2304x1728.
                    const currentWidth =
                        this.width;

                    const currentHeight =
                        this.height;

                    const logicalWidth =
                        currentWidth >=
                        (1024 * HTML_CAPTURE_SCALE)
                            ? currentWidth / HTML_CAPTURE_SCALE
                            : currentWidth;

                    const logicalHeight =
                        currentHeight >=
                        (768 * HTML_CAPTURE_SCALE)
                            ? currentHeight / HTML_CAPTURE_SCALE
                            : currentHeight;

                    if (
                        logicalWidth > 0 &&
                        logicalHeight > 0
                    ) {

                        _htmlWidthDescriptor.set.call(
                            this,
                            logicalWidth *
                            HTML_CAPTURE_SCALE
                        );

                        _htmlHeightDescriptor.set.call(
                            this,
                            logicalHeight *
                            HTML_CAPTURE_SCALE
                        );

                        ctx.scale(
                            HTML_CAPTURE_SCALE,
                            HTML_CAPTURE_SCALE
                        );

                    }

                }

                return ctx;

            }

            return originalGetContext.call(
                this,
                type,
                ...args
            );

        };

    try {

        return callback();

    }
    finally {

        _htmlCaptureActive = false;
        _htmlCaptureCanvas = null;

        removeHTMLCaptureResolutionPatch();

    }

}


// ============================================================
// CREATE PORTFOLIO HTML MESH
// ============================================================

async function createPortfolioHTMLMesh(screenObject) {


    // --------------------------------------------------------
    // Load the portfolio files from /public/portfolio
    // --------------------------------------------------------

    const [htmlResponse, cssResponse, jsResponse] =
        await Promise.all([
            fetch('/portfolio/index.html'),
            fetch('/portfolio/style.css'),
            fetch('/portfolio/app.js')
        ]);

    if (!htmlResponse.ok) {
        throw new Error(`Portfolio HTML: HTTP ${htmlResponse.status}`);
    }

    if (!cssResponse.ok) {
        throw new Error(`Portfolio CSS: HTTP ${cssResponse.status}`);
    }

    if (!jsResponse.ok) {
        throw new Error(`Portfolio JS: HTTP ${jsResponse.status}`);
    }

    const html = await htmlResponse.text();
    const css = await cssResponse.text();
    const js = await jsResponse.text();


    // --------------------------------------------------------
    // Create an off-screen DOM surface.
    // It remains visible to the browser so HTMLMesh can measure it.
    // --------------------------------------------------------

    const element =
        document.createElement('div');

    // Logical HTML layout remains 1024x768.
    // HTMLMesh internally rasterizes this at HTML_CAPTURE_SCALE = 1.5,
    // producing a 1536x1152 texture without changing the layout.
    element.style.width = '1024px';
    element.style.height = '768px';
    element.style.position = 'fixed';
    element.style.left = '-2000px';
    element.style.top = '0';
    element.style.overflow = 'hidden';
    element.style.visibility = 'visible';
    element.style.pointerEvents = 'none';
    element.style.background = '#0b0d0f';
    element.style.boxSizing = 'border-box';


    // --------------------------------------------------------
    // Collapse whitespace in text nodes before HTMLMesh ever
    // sees them.
    //
    // The portfolio's HTML source has paragraphs written across
    // multiple indented lines (normal, readable formatting).
    // Regular browser rendering collapses that internal
    // whitespace visually with no issue — but HTMLMesh doesn't
    // render through the normal browser layout pipeline; it
    // hand-draws each text node by walking Range.getClientRects()
    // and drawing glyph runs onto a canvas. That custom logic
    // gets confused by the embedded newlines/indentation still
    // present in the text *content* (not just its visual
    // layout), which is what produced the stretched/gapped word
    // spacing on pages like About. Collapsing runs of whitespace
    // to a single space (skipping <pre>/<code>/<script>/<style>)
    // mirrors what the browser already does visually, so nothing
    // about the copy or layout changes — it just makes the text
    // nodes safe for HTMLMesh's renderer.
    // --------------------------------------------------------

    const WHITESPACE_PRESERVING_TAGS =
        new Set(['PRE', 'CODE', 'TEXTAREA', 'SCRIPT', 'STYLE']);

    function collapseWhitespace(node) {

        for (const child of Array.from(node.childNodes)) {

            if (child.nodeType === Node.TEXT_NODE) {

                child.textContent =
                    child.textContent
                        .replace(/\s+/g, ' ');

            }
            else if (
                child.nodeType === Node.ELEMENT_NODE &&
                !WHITESPACE_PRESERVING_TAGS.has(child.tagName)
            ) {

                collapseWhitespace(child);

            }

        }

    }


    // --------------------------------------------------------
    // Extract only the portfolio body content.
    // --------------------------------------------------------

    const parser =
        new DOMParser();

    const documentFragment =
        parser.parseFromString(
            html,
            'text/html'
        );

    collapseWhitespace(documentFragment.body);

    element.innerHTML =
        documentFragment.body.innerHTML;

    portfolioDomElement =
        element;


    // --------------------------------------------------------
    // Add portfolio CSS to the page.
    // --------------------------------------------------------

    const style =
        document.createElement('style');

    style.textContent = css;

    element.appendChild(style);

    document.body.appendChild(element);


    // --------------------------------------------------------
    // Execute the portfolio's JavaScript after its DOM exists.
    // --------------------------------------------------------

    const script =
        document.createElement('script');

    script.textContent = js;

    element.appendChild(script);


    // --------------------------------------------------------
    // Let the browser calculate the layout before HTMLMesh
    // takes its first snapshot.
    // --------------------------------------------------------

    await new Promise(resolve => {
        requestAnimationFrame(() => {
            requestAnimationFrame(resolve);
        });
    });


    // --------------------------------------------------------
    // Create HTMLMesh.
    // --------------------------------------------------------

    const htmlMesh =
        withHighResolutionHTMLCapture(
            () => new HTMLMesh(element)
        );


    // --------------------------------------------------------
    // Re-apply the 1.5x capture for every HTMLTexture update.
    // HTMLMesh schedules update() after DOM mutations (including
    // portfolio tab changes).
    // --------------------------------------------------------

    const htmlTexture =
        htmlMesh.material.map;

    if (
        htmlTexture &&
        typeof htmlTexture.update === 'function'
    ) {

        const originalHTMLTextureUpdate =
            htmlTexture.update.bind(
                htmlTexture
            );

        htmlTexture.update =
            function(...args) {

                return withHighResolutionHTMLCapture(
                    () =>
                        originalHTMLTextureUpdate(...args)
                );

            };

    }


    // --------------------------------------------------------
    // 3D orientation — calibrated working value.
    // --------------------------------------------------------

    htmlMesh.rotation.x =
        Math.PI / 2;


    // --------------------------------------------------------
    // Measure the physical iPad screen.
    // --------------------------------------------------------

    const positions =
        screenObject.geometry
            .attributes
            .position;

    const vertex =
        new THREE.Vector3();

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (
        let i = 0;
        i < positions.count;
        i++
    ) {

        vertex.fromBufferAttribute(
            positions,
            i
        );

        minX = Math.min(
            minX,
            vertex.x
        );

        maxX = Math.max(
            maxX,
            vertex.x
        );

        minZ = Math.min(
            minZ,
            vertex.z
        );

        maxZ = Math.max(
            maxZ,
            vertex.z
        );
    }


    const screenWidth =
        maxX - minX;

    const screenHeight =
        maxZ - minZ;


    // --------------------------------------------------------
    // HTMLMesh physical size.
    //
    // HTMLMesh is parented to screenObject below, so the parent
    // scale is inherited automatically. Do NOT divide by
    // screenObject.scale here.
    //
    // The HTML document remains at its proven 1024x768 logical
    // resolution. This keeps the existing HTMLMesh setup intact.
    // --------------------------------------------------------

    // HTMLMesh geometry is created from the raster canvas dimensions.
    // Since the canvas is 1.5x internally, compensate here so the
    // physical HTMLMesh remains exactly the same size on the iPad.
    // HTMLMesh creates its plane from texture.image.width/height.
    // The corrected capture is exactly 1536x1152, so divide the
    // automatically-created plane dimensions by 1.5 to retain the
    // original physical iPad screen size.
    const scaleX =
        screenWidth /
        (1.024 * HTML_CAPTURE_SCALE);

    const scaleY =
        screenHeight /
        (0.768 * HTML_CAPTURE_SCALE);

    htmlMesh.scale.set(
        scaleX,
        scaleY,
        1
    );


    // --------------------------------------------------------
    // Working screen position.
    // --------------------------------------------------------

    htmlMesh.position.set(
        0,
        0.1,
        0
    );


    // --------------------------------------------------------
    // Working texture orientation.
    // --------------------------------------------------------

    const texture =
        htmlMesh.material.map;

    if (texture) {

        // Keep the existing HTMLTexture resolution/layout untouched.
        // These settings improve texture sampling when the enlarged
        // iPad is viewed at an angle without changing HTMLMesh size
        // or restructuring the DOM.
        texture.minFilter =
            THREE.LinearFilter;

        texture.magFilter =
            THREE.LinearFilter;

        texture.generateMipmaps =
            false;

        texture.anisotropy =
            renderer.capabilities.getMaxAnisotropy();

        texture.needsUpdate =
            true;

        texture.center.set(
            0.5,
            0.5
        );

        texture.rotation =
            -Math.PI / 2;

        texture.repeat.x =
            1;

        texture.repeat.y =
            -1;

        texture.wrapS =
            THREE.RepeatWrapping;

        texture.wrapT =
            THREE.ClampToEdgeWrapping;

        texture.needsUpdate =
            true;
    }


    // --------------------------------------------------------
    // Fix click/tap targeting.
    //
    // The visual orientation above (texture.rotation = -90°,
    // repeat.y = -1) rotates+mirrors what's rendered, but
    // InteractiveGroup computes click coordinates from the raw,
    // untransformed plane UV. Left uncorrected, that mismatch is
    // exactly why taps landed on the wrong control (e.g. having
    // to click the far-left edge to hit a button near the top).
    //
    // Working through the same rotation/flip that the texture
    // uses shows the fix is a simple swap of the incoming x/y
    // (see PR notes) — so we intercept dispatchEvent and correct
    // the coordinates before HTMLMesh translates them into a
    // simulated DOM click.
    // --------------------------------------------------------

    const originalDispatchEvent =
        htmlMesh.dispatchEvent.bind(htmlMesh);

    htmlMesh.dispatchEvent = function (event) {

        if (
            event.data &&
            typeof event.data.set === 'function'
        ) {

            const rawX = event.data.x;

            const rawY = event.data.y;

            event.data.set(
                rawY,
                rawX
            );

        }

        originalDispatchEvent(event);

    };


    // --------------------------------------------------------
    // Working depth settings.
    // --------------------------------------------------------

    htmlMesh.material.side =
        THREE.DoubleSide;

    htmlMesh.material.depthTest =
        true;

    htmlMesh.material.depthWrite =
        true;

    // Never let fog affect the screen's readability, regardless
    // of how the fog distances get tuned for the outdoor scene.
    htmlMesh.material.fog =
        false;

    htmlMesh.renderOrder =
        1;


    screenObject.add(
        interactiveGroup
    );

    interactiveGroup.add(
        htmlMesh
    );

    portfolioScreenMesh =
        htmlMesh;

    return htmlMesh;
}

// ============================================================
// CAMERA LOOK — drag based
// ============================================================
//
// Desktop: hold the RIGHT mouse button and drag to look around
// (left click/tap is left free for interacting with the iPad
// screen). Touch/iPad: a single-finger drag anywhere that is
// NOT on the iPad screen also rotates the camera — this avoids
// relying on the Pointer Lock API, which iOS Safari does not
// support, and which was the main reason camera look silently
// failed on iPad.

let isDragging = false;

let dragPointerId = null;

let lastPointerX = 0;

let lastPointerY = 0;


// --------------------------------------------------------
// Touch-drag-to-scroll state, for scrolling the screen's
// active page. See the note on portfolioDomElement above for
// why this has to be done manually.
// --------------------------------------------------------

let isScrollDragging = false;

let scrollDragPointerId = null;

let scrollDragMoved = false;

let lastScrollY = 0;

// Small threshold before a touch-on-screen counts as a scroll
// rather than a tap, so a genuine tap's click still reaches
// InteractiveGroup normally instead of being eaten here.
const SCROLL_DRAG_THRESHOLD = 4;


function scrollActivePortfolioPage(deltaY) {

    if (!portfolioDomElement) {

        return;

    }

    const activePage =
        portfolioDomElement.querySelector('.page.active');

    if (!activePage) {

        return;

    }

    activePage.scrollTop += deltaY;

    // scrollTop isn't a DOM mutation, so HTMLMesh's
    // MutationObserver-driven redraw never fires for it — ask it
    // to redraw directly instead.
    if (
        portfolioScreenMesh &&
        typeof portfolioScreenMesh.update === 'function'
    ) {

        portfolioScreenMesh.update();

    }

}


renderer.domElement.addEventListener(
    'contextmenu',
    (event) => {

        event.preventDefault();

    }
);


renderer.domElement.addEventListener(
    'pointerdown',
    (event) => {

        // Desktop mouse: only the right button (button === 2)
        // starts a look-drag. Left button is reserved for
        // interacting with the iPad screen.

        if (
            event.pointerType === 'mouse' &&
            event.button !== 2
        ) {

            return;

        }


        // Touch / pen: don't hijack taps that land on the iPad for
        // camera-look — but DO let them scroll the screen's active
        // page if the touch turns into a vertical drag (see the
        // scroll-drag state below and its pointermove listener).

        if (event.pointerType !== 'mouse') {

            const rect =
                renderer.domElement.getBoundingClientRect();

            const touchNdc =
                new THREE.Vector2(
                    ((event.clientX - rect.left) / rect.width) * 2 - 1,
                    -((event.clientY - rect.top) / rect.height) * 2 + 1
                );

            raycaster.setFromCamera(
                touchNdc,
                camera
            );

            const touchHits =
                ipad
                    ? raycaster.intersectObject(ipad, true)
                    : [];

            if (touchHits.length > 0) {

                isScrollDragging = true;

                scrollDragPointerId = event.pointerId;

                scrollDragMoved = false;

                lastScrollY = event.clientY;

                return;

            }

        }


        isDragging = true;

        dragPointerId = event.pointerId;

        lastPointerX = event.clientX;

        lastPointerY = event.clientY;

        // Belt-and-suspenders alongside touch-action: none above —
        // some browsers still respect an explicit preventDefault
        // on the gesture that actually started dragging.
        event.preventDefault();

        renderer.domElement.setPointerCapture(
            event.pointerId
        );

    }
);


renderer.domElement.addEventListener(
    'pointermove',
    (event) => {

        if (
            !isDragging ||
            event.pointerId !== dragPointerId
        ) {

            return;

        }


        const deltaX =
            event.clientX - lastPointerX;

        const deltaY =
            event.clientY - lastPointerY;

        lastPointerX = event.clientX;

        lastPointerY = event.clientY;


        yaw -=
            deltaX *
            MOUSE_SENSITIVITY;


        pitch -=
            deltaY *
            MOUSE_SENSITIVITY;


        yaw =
            THREE.MathUtils.clamp(
                yaw,
                initialYaw - MAX_YAW,
                initialYaw + MAX_YAW
            );


        pitch =
            THREE.MathUtils.clamp(
                pitch,
                -MAX_PITCH,
                MAX_PITCH
            );

    }
);


function endDrag(event) {

    if (event.pointerId !== dragPointerId) {

        return;

    }

    isDragging = false;

    dragPointerId = null;

    try {

        renderer.domElement.releasePointerCapture(
            event.pointerId
        );

    } catch (error) {

        // pointer capture may already be released — ignore

    }

}


renderer.domElement.addEventListener('pointerup', endDrag);

renderer.domElement.addEventListener('pointercancel', endDrag);


// ============================================================
// TOUCH-DRAG-TO-SCROLL
// ============================================================

renderer.domElement.addEventListener(
    'pointermove',
    (event) => {

        if (
            !isScrollDragging ||
            event.pointerId !== scrollDragPointerId
        ) {

            return;

        }

        const deltaY =
            event.clientY - lastScrollY;

        lastScrollY =
            event.clientY;

        if (
            !scrollDragMoved &&
            Math.abs(deltaY) < SCROLL_DRAG_THRESHOLD
        ) {

            return;

        }

        // Past the threshold now — this is a scroll, not a tap.
        // Stop it from also being interpreted as a tap/click once
        // released.
        scrollDragMoved = true;

        event.preventDefault();

        // Natural touch-scroll direction: dragging up moves
        // content up (scrollTop increases).
        scrollActivePortfolioPage(-deltaY);

    },
    { passive: false }
);


function endScrollDrag(event) {

    if (event.pointerId !== scrollDragPointerId) {

        return;

    }

    isScrollDragging = false;

    scrollDragPointerId = null;

    scrollDragMoved = false;

}


renderer.domElement.addEventListener('pointerup', endScrollDrag);

renderer.domElement.addEventListener('pointercancel', endScrollDrag);


// ============================================================
// MOUSE-WHEEL SCROLL
// ============================================================
//
// InteractiveGroup (used for click forwarding) never listens for
// wheel events at all, so without this a mouse/trackpad has no
// way to scroll the screen's content whatsoever.

renderer.domElement.addEventListener(
    'wheel',
    (event) => {

        if (!portfolioScreenMesh) {

            return;

        }

        const rect =
            renderer.domElement.getBoundingClientRect();

        const wheelNdc =
            new THREE.Vector2(
                ((event.clientX - rect.left) / rect.width) * 2 - 1,
                -((event.clientY - rect.top) / rect.height) * 2 + 1
            );

        raycaster.setFromCamera(
            wheelNdc,
            camera
        );

        const wheelHits =
            raycaster.intersectObject(
                portfolioScreenMesh,
                true
            );

        if (wheelHits.length === 0) {

            return;

        }

        event.preventDefault();

        scrollActivePortfolioPage(event.deltaY);

    },
    { passive: false }
);


// ============================================================
// ARM REACH TRIGGER
// ============================================================
//
// Fires the arm-reach animation on real clicks/taps that hit the
// screen. Uses the browser's own 'click' event (fired for both
// mouse clicks and tap-synthesized clicks), and raycasts against
// portfolioScreenMesh — the exact same object real button clicks
// are tested against — so the reach point is guaranteed to be
// the point that was actually clicked, not a separate guess.

renderer.domElement.addEventListener(
    'click',
    (event) => {

        if (!portfolioScreenMesh) {

            return;

        }

        const rect =
            renderer.domElement.getBoundingClientRect();

        const clickNdc =
            new THREE.Vector2(
                ((event.clientX - rect.left) / rect.width) * 2 - 1,
                -((event.clientY - rect.top) / rect.height) * 2 + 1
            );

        raycaster.setFromCamera(
            clickNdc,
            camera
        );

        const clickHits =
            raycaster.intersectObject(
                portfolioScreenMesh,
                true
            );

        if (clickHits.length > 0) {

            triggerArmReach(
                clickHits[0].point
            );

        }

    }
);


// ============================================================
// MOUSE POSITION
// ============================================================

window.addEventListener(
    'pointermove',
    (event) => {

        mouse.x =
            (
                event.clientX /
                window.innerWidth
            ) * 2 - 1;


        mouse.y =
            -(
                event.clientY /
                window.innerHeight
            ) * 2 + 1;

    }
);


// ============================================================
// ANIMATION LOOP
// ============================================================

function animate() {

    requestAnimationFrame(
        animate
    );


    // --------------------------------------------------------
    // Animation
    // --------------------------------------------------------

    const delta =
        clock.getDelta();


    if (mixer) {

        mixer.update(
            delta
        );

    }

    // Decorative environment effects only.
    environmentEffects.update(delta);


    // --------------------------------------------------------
    // Camera
    // --------------------------------------------------------

    camera.rotation.order =
        'YXZ';

    camera.rotation.y =
        yaw;

    camera.rotation.x =
        pitch;


    // --------------------------------------------------------
    // Raycaster
    // --------------------------------------------------------

    raycaster.setFromCamera(
        mouse,
        camera
    );


    // --------------------------------------------------------
    // Raycast the SAME object real clicks are tested against
    // (portfolioScreenMesh), not the ipad bezel — this is what
    // keeps the debug dot, the FOV zoom trigger, and the finger
    // IK target all in agreement with where a click actually
    // lands.
    // --------------------------------------------------------

    if (portfolioScreenMesh) {

        const intersections =
            raycaster.intersectObject(
                portfolioScreenMesh,
                true
            );


        const hovering =
            intersections.length > 0;


        isHoveringIpad =
            hovering;


        if (hovering) {

            lastIpadHitPoint.copy(
                intersections[0].point
            );

        }

    }


    // --------------------------------------------------------
    // FOV — zoom in smoothly while looking at the iPad screen,
    // and back out to the normal wide view otherwise. Unchanged:
    // still driven by the same accurate hover raycast above.
    // --------------------------------------------------------

    targetFov =
        isHoveringIpad
            ? ZOOM_FOV
            : NORMAL_FOV;

    camera.fov =
        THREE.MathUtils.damp(
            camera.fov,
            targetFov,
            6,
            delta
        );

    camera.updateProjectionMatrix();


    // --------------------------------------------------------
    // Finger IK — click-triggered reach, not continuous/hover
    // chasing. See triggerArmReach(), called from the click
    // handler below with the EXACT point that was clicked (the
    // same coordinate the click itself used to hit the right
    // button), so the reach is accurate by construction instead
    // of by tuning. Runs a short reach → hold → return animation
    // and otherwise leaves the arm alone at its resting pose.
    // --------------------------------------------------------

    if (ikSolver && ikTargetBone && ikReady) {

        updateArmReach(delta);

        if (armState === 'reaching' || armState === 'holding') {

            ikTargetBone.updateMatrixWorld(true);

            ikSolver.update();

        }

    }


    // --------------------------------------------------------
    // Render
    // --------------------------------------------------------

    if (ENABLE_POST_PROCESSING) {

        composer.render();

    }
    else {

        renderer.render(
            scene,
            camera
        );

    }

}


animate();


// ============================================================
// RESIZE
// ============================================================

window.addEventListener(
    'resize',
    () => {

        camera.aspect =
            window.innerWidth /
            window.innerHeight;


        camera.updateProjectionMatrix();


        renderer.setSize(
            window.innerWidth,
            window.innerHeight
        );


        renderer.setPixelRatio(
            Math.min(
                window.devicePixelRatio,
                2
            )
        );


        composer.setSize(
            window.innerWidth,
            window.innerHeight
        );

    }
);
