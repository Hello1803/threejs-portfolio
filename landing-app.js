const pages = document.querySelectorAll("[data-page-content]");
const navItems = document.querySelectorAll(".nav-item");

const PAGE_TRANSITION_MS = 350;

const prefersReducedMotion =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let isTransitioning = false;


function topLevelFor(pageName) {
    if (
        pageName.startsWith("face-") ||
        pageName === "voice-analysis" ||
        pageName === "threejs" ||
        pageName === "kolam"
    ) {
        return "projects";
    }
    return pageName;
}

function updateNavState(pageName) {
    const topLevel = topLevelFor(pageName);

    navItems.forEach((item) => {
        item.classList.toggle("active", item.dataset.page === topLevel);
    });

    updateNavIndicator(topLevel);
}


// ============================================================
// PAGE TRANSITIONS
// ============================================================

function showPage(pageName) {

    const nextPage =
        document.querySelector(`[data-page-content="${pageName}"]`);

    if (!nextPage) {
        return;
    }

    const currentPage =
        document.querySelector("[data-page-content].active");

    if (currentPage === nextPage) {
        return;
    }

    if (isTransitioning) {
        return;
    }

    updateNavState(pageName);

    window.scrollTo({ top: 0, behavior: "instant" });

    if (prefersReducedMotion) {

        pages.forEach((page) => page.classList.remove("active", "leaving"));

        nextPage.classList.add("active");

        setupScrollReveal(nextPage);

        return;

    }

    isTransitioning = true;

    if (currentPage) {

        currentPage.classList.remove("active");

        currentPage.classList.add("leaving");

        setTimeout(() => {
            currentPage.classList.remove("leaving");
        }, PAGE_TRANSITION_MS);

    }

    // Two rAFs: the first lets the browser register the "pending"
    // (display:block, opacity:0) state as an actual paint before
    // we ask it to transition away from it — without this, adding
    // display:block and opacity:1 in the same tick just snaps
    // straight to the end state with no visible animation.
    nextPage.classList.add("pending");

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {

            nextPage.classList.remove("pending");

            nextPage.classList.add("active");

            setupScrollReveal(nextPage);

            setTimeout(() => {
                isTransitioning = false;
            }, PAGE_TRANSITION_MS);

        });
    });

}

document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
        showPage(button.dataset.page);
    });
});


// ============================================================
// SCROLL REVEAL
// ============================================================
//
// Generic component-level selectors (not tied to any one page),
// so this works across every project/about/skills page without
// needing markup changes. Re-run on every page-enter so newly
// shown content animates in; already-visited elements are
// skipped via a WeakSet so they don't re-observe indefinitely.

const REVEAL_SELECTOR = [
    ".card",
    ".project-row",
    ".case-grid > *",
    ".metric-grid > *",
    ".info-grid > div",
    ".skill-group",
    ".portfolio-image-panel",
    ".contact-link",
    ".sub-section"
].join(",");

const revealedElements = new WeakSet();

let revealObserver = null;

if ("IntersectionObserver" in window && !prefersReducedMotion) {

    revealObserver = new IntersectionObserver(
        (entries) => {

            entries.forEach((entry) => {

                if (entry.isIntersecting) {

                    entry.target.classList.add("reveal-visible");

                    revealObserver.unobserve(entry.target);

                }

            });

        },
        { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

}

function setupScrollReveal(container) {

    if (!revealObserver) {
        return;
    }

    const elements =
        container.querySelectorAll(REVEAL_SELECTOR);

    elements.forEach((el, index) => {

        if (revealedElements.has(el)) {
            return;
        }

        revealedElements.add(el);

        el.classList.add("reveal-init");

        el.style.transitionDelay = `${Math.min(index * 35, 350)}ms`;

        revealObserver.observe(el);

    });

}


// ============================================================
// SCROLL PROGRESS BAR
// ============================================================

const progressBar = document.createElement("div");
progressBar.id = "scroll-progress";
document.body.appendChild(progressBar);

function updateScrollProgress() {

    const scrollTop =
        window.scrollY ||
        document.documentElement.scrollTop;

    const scrollHeight =
        document.documentElement.scrollHeight -
        document.documentElement.clientHeight;

    const progress =
        scrollHeight > 0
            ? (scrollTop / scrollHeight) * 100
            : 0;

    progressBar.style.width = `${progress}%`;

}

window.addEventListener("scroll", updateScrollProgress, { passive: true });


// ============================================================
// ANIMATED NAV UNDERLINE
// ============================================================

const bottomNav = document.querySelector(".bottom-nav");

const navIndicator = document.createElement("div");
navIndicator.id = "nav-indicator";

if (bottomNav) {
    bottomNav.appendChild(navIndicator);
}

function updateNavIndicator(topLevelPageName) {

    if (!bottomNav) {
        return;
    }

    const activeItem =
        Array.from(navItems).find(
            (item) => item.dataset.page === topLevelPageName
        );

    if (!activeItem) {
        navIndicator.style.width = "0";
        return;
    }

    navIndicator.style.left = `${activeItem.offsetLeft}px`;
    navIndicator.style.width = `${activeItem.offsetWidth}px`;

}

window.addEventListener("resize", () => {

    const activePage =
        document.querySelector("[data-page-content].active");

    updateNavIndicator(
        topLevelFor(activePage ? activePage.dataset.pageContent : "home")
    );

});


// ============================================================
// AMBIENT BACKGROUND
// ============================================================
//
// Pure CSS-animated blur blobs — no canvas, no Three.js. Keeps
// this page's whole point (fast, lightweight, no 3D dependency)
// intact while still giving it some life.

if (!prefersReducedMotion) {

    const blobOne = document.createElement("div");
    blobOne.className = "bg-blob one";

    const blobTwo = document.createElement("div");
    blobTwo.className = "bg-blob two";

    document.body.prepend(blobTwo);
    document.body.prepend(blobOne);

}


// ============================================================
// INITIAL STATE
// ============================================================

showPage("home");

// The very first page doesn't go through the transition pipeline
// above (nothing to fade out from) - reveal it directly, and
// position the nav indicator once layout settles.
setupScrollReveal(
    document.querySelector('[data-page-content="home"]')
);

requestAnimationFrame(() => updateNavIndicator("home"));


// ============================================================
// ENTER 3D EXPERIENCE
// ============================================================

const fadeElement = document.getElementById("page-fade");
const enter3dButtons = document.querySelectorAll("[data-enter-3d]");

enter3dButtons.forEach((button) => {
    button.addEventListener("click", () => {

        if (fadeElement) {
            fadeElement.classList.add("active");
        }

        setTimeout(() => {
            window.location.href = "experience.html";
        }, 650);

    });
});


// ============================================================
// BACKGROUND PREFETCH (best-effort, never blocks anything)
// ============================================================
//
// Warms the browser's HTTP cache for experience.html's JS bundle
// and (by scanning that bundle's own text for a .glb reference)
// the landscape model too, so clicking through to the 3D scene
// later feels instant instead of starting a fresh multi-second
// download. Entirely best-effort: wrapped so any failure, or any
// change to the build output that breaks the simple text-scan
// below, just silently no-ops rather than affecting the page.

function shouldPrefetch() {

    const connection =
        navigator.connection ||
        navigator.mozConnection ||
        navigator.webkitConnection;

    if (!connection) {
        return true;
    }

    if (connection.saveData) {
        return false;
    }

    const slowTypes = ["slow-2g", "2g"];

    if (slowTypes.includes(connection.effectiveType)) {
        return false;
    }

    return true;

}

function backgroundPrefetchExperience() {

    if (!shouldPrefetch()) {
        return;
    }

    fetch("experience.html")
        .then((response) => response.text())
        .then((html) => {

            const match =
                html.match(
                    /<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/i
                );

            if (!match) {
                return;
            }

            const scriptUrl = match[1];

            return fetch(scriptUrl).then((response) => response.text());

        })
        .then((scriptText) => {

            if (!scriptText) {
                return;
            }

            const glbMatch =
                scriptText.match(/["']([^"']+\.glb)["']/i);

            if (!glbMatch) {
                return;
            }

            fetch(glbMatch[1]).catch(() => {});

        })
        .catch(() => {
            // Best-effort only - never surface this to the user.
        });

}

if ("requestIdleCallback" in window) {
    window.addEventListener("load", () => {
        requestIdleCallback(backgroundPrefetchExperience, { timeout: 4000 });
    });
} else {
    window.addEventListener("load", () => {
        setTimeout(backgroundPrefetchExperience, 2000);
    });
}
