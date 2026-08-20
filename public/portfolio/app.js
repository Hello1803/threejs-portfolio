const pages = document.querySelectorAll("[data-page-content]");
const navItems = document.querySelectorAll(".nav-item");

function showPage(pageName) {
    pages.forEach((page) => {
        page.classList.toggle(
            "active",
            page.dataset.pageContent === pageName
        );
    });

    navItems.forEach((item) => {
        const topLevel =
            pageName.startsWith("face-") ||
            pageName === "voice-analysis" ||
            pageName === "threejs" ||
            pageName === "kolam"
                ? "projects"
                : pageName;

        item.classList.toggle(
            "active",
            item.dataset.page === topLevel
        );
    });
}

document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
        showPage(button.dataset.page);
    });
});

showPage("home");
