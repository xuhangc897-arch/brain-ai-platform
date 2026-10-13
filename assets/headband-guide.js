(function () {
  "use strict";

  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 3;
  const STEP = 0.25;

  function image(modal) {
    return modal.querySelector(".headband-modal-viewport img");
  }

  function applyZoom(modal) {
    const img = image(modal);
    if (!img || !modal._headbandBaseWidth) return;
    const zoom = modal._headbandZoom;
    img.style.width = `${modal._headbandBaseWidth * zoom}px`;
    img.style.height = `${modal._headbandBaseHeight * zoom}px`;
    img.style.maxWidth = "none";
    img.style.maxHeight = "none";
    modal.querySelector("[data-headband-zoom='out']").disabled = zoom <= MIN_ZOOM;
    modal.querySelector("[data-headband-zoom='in']").disabled = zoom >= MAX_ZOOM;
  }

  function fitImage(modal) {
    const img = image(modal);
    if (!img) return;
    for (const property of ["width", "height", "max-width", "max-height"]) img.style.removeProperty(property);
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    modal._headbandBaseWidth = rect.width;
    modal._headbandBaseHeight = rect.height;
    applyZoom(modal);
  }

  window.HeadbandGuide = {
    open(modal) {
      modal._headbandParent = modal.parentNode;
      modal._headbandNext = modal.nextSibling;
      document.body.append(modal);
      modal._headbandZoom = 1;
      modal.classList.add("is-visible");
      const img = image(modal);
      img.loading = "eager";
      if (!img.complete) img.addEventListener("load", () => fitImage(modal), { once: true });
      requestAnimationFrame(() => fitImage(modal));
    },
    close(modal) {
      modal.classList.remove("is-visible");
      const img = image(modal);
      for (const property of ["width", "height", "max-width", "max-height"]) img.style.removeProperty(property);
      modal._headbandBaseWidth = 0;
      modal._headbandParent.insertBefore(modal, modal._headbandNext);
    }
  };

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-headband-zoom]");
    if (!button) return;
    const modal = button.closest(".headband-modal");
    modal._headbandZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, modal._headbandZoom + (button.dataset.headbandZoom === "in" ? STEP : -STEP)));
    applyZoom(modal);
  });

  window.addEventListener("resize", () => {
    document.querySelectorAll(".headband-modal.is-visible").forEach(fitImage);
  });
})();
