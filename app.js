const REGISTRY_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbxcANK_eHZ3aAqYYCvhYOxcdMuSNTBJ6CFvX-yRt6V2RtPbgRu9lvGYSmRHak3sumXs/exec";

const $=id=>document.getElementById(id);
let currentThumb=null;

function safe(v,fallback="Unavailable"){
  if(v===undefined||v===null||String(v).trim()==="")return fallback;
  return String(v);
}

function numberValue(...values){
  for(const value of values){
    const n=Number(value);
    if(Number.isFinite(n))return n;
  }
  return null;
}

function yes(value){
  return value===true||value===1||value==="1"||value==="true";
}

function shortHash(value){
  const text=safe(value,"Not published");
  if(text==="Not published"||text.length<=28)return text;
  return `${text.slice(0,12)}…${text.slice(-12)}`;
}

function addRows(target,rows){
  $(target).innerHTML=rows.map(([label,value,cls])=>
    `<div class="dataRow"><span>${escapeHtml(label)}</span><strong class="${cls||""}">${escapeHtml(value)}</strong></div>`
  ).join("");
}

function escapeHtml(v){
  return String(v??"").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function calculateConfidence(record){
  const locationRisk=yes(record.locationRisk);
  let score=0;
  score+=25;
  if(safe(record.imageSha256,"")!=="")score+=20;
  if(safe(record.captureSignature,"")!=="")score+=20;
  if(safe(record.captureKeyFingerprint,"")!=="")score+=10;
  if(safe(record.maskedGeoStampDeviceIdentity,"")!=="")score+=10;
  if(numberValue(record.accuracyM)!==null)score+=5;
  if(!locationRisk)score+=10;
  if(locationRisk)score=Math.min(score,69);
  return Math.max(0,Math.min(100,score));
}

function applyThumbnail(url){
  if(url){
    currentThumb=url;
    $("thumbnail").src=url;
    $("thumbnail").classList.remove("hidden");
    $("imagePlaceholder").classList.add("hidden");
  }else{
    $("thumbnail").classList.add("hidden");
    $("imagePlaceholder").classList.remove("hidden");
  }
}

function render(record,thumbUrl=null){
  const evidenceId=safe(record.evidenceId||record.verificationId);
  const captured=numberValue(record.capturedAt);
  const accuracy=numberValue(record.accuracyM);
  const lat=numberValue(record.latitude);
  const lon=numberValue(record.longitude);
  const locationRisk=yes(record.locationRisk);
  const confidence=calculateConfidence(record);

  $("certificate").classList.remove("hidden");
  $("recordStatus").textContent=locationRisk
    ?"LOCATION INTEGRITY REVIEW"
    :"REGISTERED EVIDENCE";
  $("summaryText").textContent=locationRisk
    ?"Public registry record found; location-integrity signals require review."
    :"The Evidence ID is confirmed in the GeoStamp Public Registry.";

  $("confidenceValue").textContent=`${confidence}%`;
  $("confidenceRing").style.borderColor=locationRisk
    ?"#e35b5b"
    :confidence>=80?"#35d29a":"#e0aa35";

  $("evidenceId").textContent=evidenceId;
  $("registryValue").textContent="Publicly Registered";
  $("capturedValue").textContent=captured===null
    ?"Unavailable"
    :new Date(captured).toLocaleString();
  $("primaryValue").textContent=safe(record.primaryValue);
  $("secondaryValue").textContent=safe(record.secondaryValue);

  applyThumbnail(
    thumbUrl||
    record.thumbnailUrl||
    record.imageThumbnailUrl||
    record.publicThumbnailUrl||
    record.imageUrl||
    currentThumb
  );

  addRows("locationRows",[
    ["Coordinates",lat===null||lon===null?"Unavailable":`${lat.toFixed(6)}, ${lon.toFixed(6)}`],
    ["Accuracy",accuracy===null?"Unavailable":`±${accuracy.toFixed(1)} m`],
    ["Location integrity",locationRisk?"Risk recorded":"No mock-location indicator recorded",
      locationRisk?"findingRisk":"findingPass"],
    ["Workspace",safe(record.workspaceMode)]
  ]);

  addRows("deviceRows",[
    ["Manufacturer",safe(record.deviceManufacturer)],
    ["Brand",safe(record.deviceBrand)],
    ["Model",safe(record.deviceHardwareModel)],
    ["Device identity",safe(record.maskedGeoStampDeviceIdentity)],
    ["Capture key",safe(record.captureKeySecurityLevel)],
    ["Hardware-backed",yes(record.captureKeyHardwareBacked)?"Yes":"No",
      yes(record.captureKeyHardwareBacked)?"findingPass":"findingReview"]
  ]);

  const signatureAvailable=safe(record.captureSignature,"")!=="";
  addRows("integrityRows",[
    ["Registry","Confirmed","findingPass"],
    ["Image SHA-256",shortHash(record.imageSha256),"mono"],
    ["Capture signature",signatureAvailable?"Recorded":"Not available",
      signatureAvailable?"findingPass":"findingReview"],
    ["Signature algorithm",safe(record.captureSignatureAlgorithm)],
    ["Overall finding",locationRisk?"Review required":confidence>=80?"High confidence":"Limited confidence",
      locationRisk?"findingRisk":confidence>=80?"findingPass":"findingReview"]
  ]);

  const published=numberValue(record.publishedAt);
  const created=numberValue(record.createdAt);
  const now=new Date();

  const events=[
    ["Captured",captured===null?"—":new Date(captured).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})],
    ["Sealed",created===null?"Recorded":new Date(created).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})],
    ["Signed",signatureAvailable?"Recorded":"Not available"],
    ["Registered",published===null?"Confirmed":new Date(published).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})],
    ["Verified",now.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})]
  ];

  $("timelineRows").innerHTML=events.map(([name,value])=>
    `<div class="timelineItem"><strong>${escapeHtml(name)}</strong>${escapeHtml(value)}</div>`
  ).join("");
}

async function lookupEvidence(id){
  const clean=String(id||"").trim().toUpperCase();
  if(!clean){
    $("statusMessage").textContent="Enter an Evidence ID.";
    return;
  }

  $("statusMessage").textContent="Searching public registry…";
  $("lookupButton").disabled=true;

  try{
    const response=await fetch(
      `${REGISTRY_ENDPOINT}?id=${encodeURIComponent(clean)}&v=${Date.now()}`,
      {cache:"no-store"}
    );
    const payload=await response.json();

    if(!payload.ok||!payload.record){
      throw new Error(payload.error||"Record not found.");
    }

    $("idInput").value=safe(payload.record.evidenceId||payload.record.verificationId);
    $("statusMessage").textContent="Public registry record confirmed.";
    render(payload.record,currentThumb);
  }catch(error){
    $("certificate").classList.add("hidden");
    $("statusMessage").textContent=error.message||"No public registry record found.";
  }finally{
    $("lookupButton").disabled=false;
  }
}

async function decodeQrFromPhoto(file){
  if(!("BarcodeDetector" in window)){
    throw new Error("This browser cannot read QR codes from images.");
  }

  const bitmap=await createImageBitmap(file);
  const detector=new BarcodeDetector({formats:["qr_code"]});
  const codes=await detector.detect(bitmap);

  if(!codes.length){
    throw new Error("No QR code found in the selected image.");
  }

  const raw=codes[0].rawValue;

  try{
    const url=new URL(raw);
    const directId=url.searchParams.get("id");
    if(directId)return directId;

    const encoded=url.searchParams.get("e");
    if(encoded){
      let value=encoded.replace(/-/g,"+").replace(/_/g,"/");
      while(value.length%4)value+="=";
      const decoded=JSON.parse(decodeURIComponent(escape(atob(value))));
      return decoded.evidenceId||decoded.verificationId||decoded.id;
    }
  }catch{}

  if(/^GST-[A-Z0-9-]+$/i.test(raw.trim())){
    return raw.trim();
  }

  throw new Error("The selected QR does not contain a supported GeoStamp Evidence ID.");
}

$("lookupButton").onclick=()=>lookupEvidence($("idInput").value);
$("idInput").addEventListener("keydown",event=>{
  if(event.key==="Enter")lookupEvidence(event.target.value);
});

$("photoInput").onchange=async event=>{
  const file=event.target.files?.[0];
  if(!file)return;

  currentThumb=URL.createObjectURL(file);
  applyThumbnail(currentThumb);
  $("statusMessage").textContent="Reading QR from received photo…";

  try{
    const evidenceId=await decodeQrFromPhoto(file);
    $("idInput").value=evidenceId;
    await lookupEvidence(evidenceId);
  }catch(error){
    $("statusMessage").textContent=error.message;
  }
};

$("printButton").onclick=()=>window.print();

const queryId=new URLSearchParams(location.search).get("id");
if(queryId){
  $("idInput").value=queryId;
  lookupEvidence(queryId);
}
