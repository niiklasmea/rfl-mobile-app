(() => {
  const dialog = document.getElementById("profileCropDialog");
  const frame = document.getElementById("profileCropFrame");
  const image = document.getElementById("profileCropImage");
  const zoom = document.getElementById("profileCropZoom");
  const zoomValue = document.getElementById("profileCropZoomValue");
  const applyButton = document.getElementById("applyProfileCrop");
  const chooseButton = document.getElementById("chooseProfileImage");

  let sourceImage = null;
  let cropX = 0;
  let cropY = 0;
  let displayWidth = 0;
  let displayHeight = 0;
  let drag = null;

  function placeImage() {
    if (!sourceImage) return;
    const size = frame.clientWidth;
    cropX = Math.max(size - displayWidth, Math.min(0, cropX));
    cropY = Math.max(size - displayHeight, Math.min(0, cropY));
    image.style.left = `${cropX}px`;
    image.style.top = `${cropY}px`;
  }

  function renderImage(preserveCenter = false) {
    if (!sourceImage) return;
    const size = frame.clientWidth;
    if (!size) return;

    const oldWidth = displayWidth;
    const oldHeight = displayHeight;
    const baseScale = Math.max(size / sourceImage.naturalWidth, size / sourceImage.naturalHeight);
    const scale = baseScale * Number(zoom.value);
    const nextWidth = sourceImage.naturalWidth * scale;
    const nextHeight = sourceImage.naturalHeight * scale;

    if (preserveCenter && oldWidth && oldHeight) {
      cropX = size / 2 + (cropX + oldWidth / 2 - size / 2) * (nextWidth / oldWidth) - nextWidth / 2;
      cropY = size / 2 + (cropY + oldHeight / 2 - size / 2) * (nextHeight / oldHeight) - nextHeight / 2;
    } else if (!oldWidth || !oldHeight) {
      cropX = (size - nextWidth) / 2;
      cropY = (size - nextHeight) / 2;
    }

    displayWidth = nextWidth;
    displayHeight = nextHeight;
    image.style.width = `${displayWidth}px`;
    image.style.height = `${displayHeight}px`;
    zoomValue.textContent = `${Math.round(Number(zoom.value) * 100)}%`;
    placeImage();
  }

  function closeCrop() {
    if (!dialog.classList.contains("open")) return;
    dialog.classList.remove("open");
    dialog.setAttribute("aria-hidden", "true");
    image.removeAttribute("src");
    sourceImage = null;
    displayWidth = 0;
    displayHeight = 0;
    drag = null;
    frame.classList.remove("dragging");
    chooseButton.focus();
  }

  function openCrop(source) {
    return new Promise((resolve, reject) => {
      image.onload = () => {
        sourceImage = image;
        cropX = 0;
        cropY = 0;
        displayWidth = 0;
        displayHeight = 0;
        zoom.value = "1";
        dialog.classList.add("open");
        dialog.setAttribute("aria-hidden", "false");
        window.requestAnimationFrame(() => {
          renderImage();
          applyButton.focus();
          resolve();
        });
      };
      image.onerror = reject;
      image.src = source;
    });
  }

  function applyCrop() {
    if (!sourceImage || !frame.clientWidth) return;
    const outputSize = 256;
    const ratio = outputSize / frame.clientWidth;
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext("2d");
    context.fillStyle = "#090c0d";
    context.fillRect(0, 0, outputSize, outputSize);
    context.drawImage(sourceImage, cropX * ratio, cropY * ratio, displayWidth * ratio, displayHeight * ratio);
    pendingPhoto = canvas.toDataURL("image/jpeg", 0.82);
    paintProfileAvatar(document.getElementById("settingsAvatar"), pendingPhoto, nameInput.value);
    closeCrop();
  }

  zoom.addEventListener("input", () => renderImage(true));
  applyButton.addEventListener("click", applyCrop);
  dialog.querySelectorAll("[data-cancel-profile-crop]").forEach((button) => button.addEventListener("click", closeCrop));

  frame.addEventListener("pointerdown", (event) => {
    if (!sourceImage) return;
    event.preventDefault();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, cropX, cropY };
    frame.setPointerCapture(event.pointerId);
    frame.classList.add("dragging");
  });
  frame.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    cropX = drag.cropX + event.clientX - drag.x;
    cropY = drag.cropY + event.clientY - drag.y;
    placeImage();
  });
  const endDrag = (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    drag = null;
    frame.classList.remove("dragging");
  };
  frame.addEventListener("pointerup", endDrag);
  frame.addEventListener("pointercancel", endDrag);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !dialog.classList.contains("open")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeCrop();
  }, true);

  photoInput.addEventListener("change", async (event) => {
    event.stopImmediatePropagation();
    const file = photoInput.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      tell(words[lang].imageTooLarge);
      photoInput.value = "";
      return;
    }

    try {
      const source = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error("Image could not be read"));
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      await openCrop(source);
    } catch {
      tell(words[lang].imageTooLarge);
    } finally {
      photoInput.value = "";
    }
  }, true);
})();
