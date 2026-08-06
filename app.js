const REGISTRY_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbxcANK_eHZ3aAqYYCvhYOxcdMuSNTBJ6CFvX-yRt6V2RtPbgRu9lvGYSmRHak3sumXs/exec";

const $ = id => document.getElementById(id);

function openCertificate(evidenceId) {
  const clean = String(evidenceId || "").trim().toUpperCase();

  if (!clean) {
    $("statusMessage").textContent = "Enter an Evidence ID.";
    return;
  }

  $("statusMessage").textContent = "Opening registry certificate…";

  const url =
    `${REGISTRY_ENDPOINT}` +
    `?view=certificate` +
    `&id=${encodeURIComponent(clean)}` +
    `&v=${Date.now()}`;

  // Full-page navigation avoids CORS, JSONP and iframe transport entirely.
  window.location.assign(url);
}

async function decodeQrFromPhoto(file) {
  if (!("BarcodeDetector" in window)) {
    throw new Error(
      "This browser cannot read QR codes from images."
    );
  }

  const bitmap = await createImageBitmap(file);
  const detector = new BarcodeDetector({
    formats: ["qr_code"]
  });
  const codes = await detector.detect(bitmap);

  if (!codes.length) {
    throw new Error(
      "No QR code found in the selected image."
    );
  }

  const raw = codes[0].rawValue;

  try {
    const url = new URL(raw);
    const directId = url.searchParams.get("id");
    if (directId) return directId;

    const encoded = url.searchParams.get("e");
    if (encoded) {
      let value = encoded
        .replace(/-/g, "+")
        .replace(/_/g, "/");

      while (value.length % 4) value += "=";

      const decoded = JSON.parse(
        decodeURIComponent(escape(atob(value)))
      );

      return decoded.evidenceId ||
        decoded.verificationId ||
        decoded.id;
    }
  } catch (_) {}

  if (/^GST-[A-Z0-9-]+$/i.test(raw.trim())) {
    return raw.trim();
  }

  throw new Error(
    "The selected QR does not contain a supported GeoStamp Evidence ID."
  );
}

$("lookupButton").onclick = () => {
  openCertificate($("idInput").value);
};

$("idInput").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    openCertificate(event.target.value);
  }
});

$("photoInput").onchange = async event => {
  const file = event.target.files?.[0];
  if (!file) return;

  $("statusMessage").textContent =
    "Reading QR from received photo…";

  try {
    const evidenceId = await decodeQrFromPhoto(file);
    $("idInput").value = evidenceId;
    openCertificate(evidenceId);
  } catch (error) {
    $("statusMessage").textContent =
      error.message || "QR could not be read.";
  }
};

const queryId =
  new URLSearchParams(location.search).get("id");

if (queryId) {
  $("idInput").value = queryId;
}
