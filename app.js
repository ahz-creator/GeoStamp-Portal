const $=s=>document.querySelector(s);
let currentData=null;
let currentRegistryBacked=false;
let currentThumb=null;

function escapeHtml(v){
  return String(v??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function decodePayload(raw){
  try{
    const u=new URL(raw);
    raw=u.searchParams.get('e')||raw;
  }catch{}
  raw=raw.replace(/-/g,'+').replace(/_/g,'/');
  while(raw.length%4)raw+='=';
  return JSON.parse(decodeURIComponent(escape(atob(raw))));
}

function first(...values){
  return values.find(v=>v!==undefined&&v!==null&&String(v).trim()!=='') ?? 'Unavailable';
}

function boolValue(...values){
  const v=values.find(x=>x!==undefined&&x!==null);
  return v===true||v===1||v==='1'||v==='true';
}

function numeric(...values){
  for(const value of values){
    const n=Number(value);
    if(Number.isFinite(n))return n;
  }
  return null;
}

function shortHash(value){
  const v=String(value??'').trim();
  if(!v)return 'Not published';
  if(v.length<=28)return v;
  return `${v.slice(0,12)}…${v.slice(-12)}`;
}

function addRows(target,items){
  $(target).innerHTML=items.map(([k,v,cls])=>
    `<div class="dataRow"><span>${escapeHtml(k)}</span><strong class="${cls||''}">${escapeHtml(v)}</strong></div>`
  ).join('');
}

function imageHashMatch(data){
  const registered=first(data.imageSha256,data.sha256,data.registeredImageSha256);
  const submitted=first(data.submittedImageSha256,data.currentImageSha256);
  if(registered==='Unavailable'||registered==='Not published')return 'Not available';
  if(submitted==='Unavailable')return 'Registered hash recorded';
  return registered.toLowerCase()===submitted.toLowerCase()?'Matched':'Mismatch';
}

function signatureFinding(data){
  if(data.captureSignatureValid===true)return 'Valid';
  if(data.captureSignatureValid===false)return 'Invalid';
  return first(data.captureSignature)==='Unavailable'?'Not available':'Recorded — validation pending';
}

function calculateConfidence(data,registryBacked){
  const risk=boolValue(data.locationRisk,data.locationIntegrityRisk,data.lr);
  let available=0;
  let earned=0;

  const award=(weight,condition)=>{
    available+=weight;
    if(condition)earned+=weight;
  };

  award(25,registryBacked);
  const hashFinding=imageHashMatch(data);
  award(25,hashFinding==='Matched'||hashFinding==='Registered hash recorded');
  const sig=signatureFinding(data);
  award(20,sig==='Valid'||sig==='Recorded — validation pending');
  award(10,first(data.maskedGeoStampDeviceIdentity,data.geoStampDeviceIdentity,data.gdi)!=='Unavailable');
  award(10,numeric(data.accuracyM,data.accuracy,data.acc,data.a)!==null);
  award(10,!risk);

  if(available===0)return 0;
  const score=Math.round((earned/available)*100);
  return risk?Math.min(score,69):score;
}

function setThumbnail(url){
  if(url){
    currentThumb=url;
    $('#thumb').src=url;
    $('#thumb').classList.remove('hidden');
    $('#thumbPlaceholder').classList.add('hidden');
  }else{
    currentThumb=null;
    $('#thumb').classList.add('hidden');
    $('#thumbPlaceholder').classList.remove('hidden');
  }
}

function reportThumbnailUrl(data){
  return first(
    data.thumbnailUrl,
    data.thumbUrl,
    data.imageThumbnailUrl,
    data.publicThumbnailUrl,
    data.imageUrl
  );
}

function show(data,thumb,registryBacked=false){
  currentData=data;
  currentRegistryBacked=registryBacked;
  $('#result').classList.remove('hidden');

  const risk=boolValue(data.locationRisk,data.locationIntegrityRisk,data.lr);
  const id=first(data.evidenceId,data.verificationId,data.id);
  const captured=first(data.capturedAt,data.ts,data.timestamp);
  const capturedNumber=numeric(captured);
  const capturedText=capturedNumber===null?'Unavailable':new Date(capturedNumber).toLocaleString();
  const primary=first(data.primaryValue,data.operator,data.p);
  const secondary=first(data.secondaryValue,data.siteId,data.s);
  const workspace=first(data.workspaceMode,data.workspace,data.wm,data.w);
  const lat=numeric(data.latitude,data.lat);
  const lon=numeric(data.longitude,data.lon);
  const accuracy=numeric(data.accuracyM,data.accuracy,data.acc,data.a);
  const brand=first(data.deviceBrand,data.brand,data.db,data.manufacturer);
  const model=first(data.deviceHardwareModel,data.deviceModel,data.model,data.dm);
  const deviceIdentity=first(
    data.maskedGeoStampDeviceIdentity,
    data.geoStampDeviceIdentity,
    data.gdi
  );
  const keyFingerprint=first(data.captureKeyFingerprint,data.kf);
  const registry=registryBacked||data.registryStatus==='PUBLIC_RECORD'
    ?'Publicly Registered'
    :'Embedded QR Record';
  const score=calculateConfidence(data,registryBacked);
  const hashFinding=imageHashMatch(data);
  const signature=signatureFinding(data);

  $('#overall').textContent=risk
    ?'LOCATION INTEGRITY REVIEW'
    :registryBacked
      ?'REGISTERED EVIDENCE'
      :'QR RECORD FOUND';

  $('#conclusion').textContent=risk
    ?'Evidence record found; location-integrity signals require review.'
    :registryBacked
      ?'The Evidence ID is confirmed in the GeoStamp Public Registry.'
      :'A structured GeoStamp capture record was decoded from the QR.';

  $('#confidenceValue').textContent=`${score}%`;
  $('#confidenceSeal').style.borderColor=risk?'#e35b5b':score>=80?'#35d29a':'#e0aa35';

  $('#evidenceId').textContent=id;
  $('#registryValue').textContent=registry;
  $('#capturedValue').textContent=capturedText;
  $('#primaryValue').textContent=primary;
  $('#secondaryValue').textContent=secondary;

  const storedThumb=reportThumbnailUrl(data);
  setThumbnail(thumb || (storedThumb!=='Unavailable'?storedThumb:null));

  addRows('#locationRows',[
    ['Coordinates',lat===null||lon===null?'Unavailable':`${lat.toFixed(6)}, ${lon.toFixed(6)}`],
    ['Accuracy',accuracy===null?'Unavailable':`±${accuracy.toFixed(1)} m`],
    ['Location integrity',risk?'Risk recorded':'No mock-location indicator recorded',risk?'findingRisk':'findingPass'],
    ['Workspace',workspace]
  ]);

  addRows('#deviceRows',[
    ['Brand',brand],
    ['Model',model],
    ['Device identity',deviceIdentity],
    ['Capture key',keyFingerprint==='Unavailable'
      ?first(data.captureKeySecurityLevel)
      :keyFingerprint,
      keyFingerprint==='Unavailable'?'findingReview':'findingPass'],
    ['Capture signature',signature,
      signature==='Valid'?'findingPass':signature==='Invalid'?'findingRisk':'findingReview']
  ]);

  const imageHash=first(data.imageSha256,data.sha256,data.registeredImageSha256);
  addRows('#integrityRows',[
    ['Registry',registry,registryBacked?'findingPass':'findingReview'],
    ['Image SHA-256',shortHash(imageHash),imageHash==='Unavailable'?'findingReview':'valueMono'],
    ['Hash comparison',hashFinding,
      hashFinding==='Matched'?'findingPass':hashFinding==='Mismatch'?'findingRisk':'findingReview'],
    ['Capture signature',signature,
      signature==='Valid'?'findingPass':signature==='Invalid'?'findingRisk':'findingReview'],
    ['Overall finding',risk?'Review required':score>=80?'High confidence':'Limited confidence',
      risk?'findingRisk':score>=80?'findingPass':'findingReview']
  ]);

  const now=new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  const captureTime=capturedNumber===null
    ?'—'
    :new Date(capturedNumber).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  const hashTime=first(data.hashGeneratedAt,data.hashAt);
  const signedTime=first(data.signedAt,data.signatureCreatedAt);
  const registryTime=first(data.publishedAt,data.registeredAt);
  const events=[
    ['Captured',captureTime],
    ['Hash',imageHash==='Unavailable'?'Not available':hashTime==='Unavailable'?'Recorded':new Date(Number(hashTime)).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})],
    ['Signed',signature==='Not available'?'Not available':signedTime==='Unavailable'?'Recorded':new Date(Number(signedTime)).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})],
    ['Registry',registryBacked?(registryTime==='Unavailable'?'Confirmed':new Date(Number(registryTime)).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})):'Not confirmed'],
    ['Verified',now]
  ];
  $('#timelineRows').innerHTML=events.map(([name,value])=>
    `<div class="timelineItem"><strong>${escapeHtml(name)}</strong>${escapeHtml(value)}</div>`
  ).join('');

  $('#scanStatus').textContent=registryBacked
    ?'Public registry record loaded.'
    :'Embedded QR evidence loaded. Public registry confirmation is not available for this record.';
}

let registryEndpointCache=null;

async function registryEndpoint(){
  if(registryEndpointCache)return registryEndpointCache;
  try{
    const r=await fetch(
      `https://raw.githubusercontent.com/ahz-creator/GeoStamp-Config/main/registry.json?v=${Date.now()}`,
      {cache:'no-store'}
    );
    if(!r.ok)return null;
    const cfg=await r.json();
    if(cfg.enabled!==false && /^https:\/\/.+/.test(String(cfg.endpoint||''))){
      registryEndpointCache=cfg.endpoint;
      return registryEndpointCache;
    }
  }catch{}
  return null;
}

async function fetchRegistry(id){
  const clean=String(id||'').trim();
  if(!clean)return null;

  const endpoint=await registryEndpoint();
  if(endpoint){
    try{
      const r=await fetch(
        `${endpoint}?id=${encodeURIComponent(clean)}&v=${Date.now()}`,
        {cache:'no-store'}
      );
      if(r.ok){
        const payload=await r.json();
        if(payload.ok!==false)return payload.record||payload;
      }
    }catch{}
  }

  // Compatibility fallback for older manually published GitHub records.
  try{
    const r=await fetch(
      `https://raw.githubusercontent.com/ahz-creator/GeoStamp-Config/main/evidence/${encodeURIComponent(clean.toLowerCase())}.json?v=${Date.now()}`,
      {cache:'no-store'}
    );
    if(!r.ok)return null;
    return await r.json();
  }catch{
    return null;
  }
}

async function lookup(id){
  const clean=id.trim();
  if(!clean)return;
  $('#scanStatus').textContent='Searching public registry…';
  try{
    const record=await fetchRegistry(clean);
    if(!record)throw 0;
    show(record,currentThumb,true);
  }catch{
    $('#result').classList.add('hidden');
    $('#scanStatus').textContent='No public registry record found. Check the Evidence ID or scan the QR on the received photo.';
  }
}

async function attachPhoto(file,alsoScan=true){
  if(!file)return;
  const thumb=URL.createObjectURL(file);
  setThumbnail(thumb);

  if(!alsoScan)return;
  if(!('BarcodeDetector' in window)){
    $('#scanStatus').textContent='Photo attached. This browser cannot scan its QR automatically.';
    return;
  }

  try{
    const bitmap=await createImageBitmap(file);
    const codes=await new BarcodeDetector({formats:['qr_code']}).detect(bitmap);
    if(!codes.length)throw 0;
    const raw=codes[0].rawValue;

    try{
      const u=new URL(raw);
      const id=u.searchParams.get('id');
      const embedded=u.searchParams.get('e');

      if(embedded){
        const embeddedData=decodePayload(embedded);
        show(embeddedData,thumb,false);
        const embeddedId=first(
          embeddedData.evidenceId,
          embeddedData.verificationId,
          embeddedData.id
        );
        if(embeddedId!=='Unavailable'){
          const registryRecord=await fetchRegistry(embeddedId);
          if(registryRecord)show({...embeddedData,...registryRecord},thumb,true);
        }
        return;
      }

      if(id){
        $('#idInput').value=id;
        const registryRecord=await fetchRegistry(id);
        if(registryRecord)show(registryRecord,thumb,true);
        else $('#scanStatus').textContent='QR read, but no public registry record was found.';
        return;
      }
    }catch{}

    const embeddedData=decodePayload(raw);
    show(embeddedData,thumb,false);
    const embeddedId=first(
      embeddedData.evidenceId,
      embeddedData.verificationId,
      embeddedData.id
    );
    if(embeddedId!=='Unavailable'){
      const registryRecord=await fetchRegistry(embeddedId);
      if(registryRecord)show({...embeddedData,...registryRecord},thumb,true);
    }
  }catch{
    $('#scanStatus').textContent='Photo attached, but its QR could not be read.';
  }
}

$('#lookup').onclick=()=>lookup($('#idInput').value);
$('#idInput').addEventListener('keydown',e=>{
  if(e.key==='Enter')lookup(e.target.value);
});
$('#photo').onchange=e=>attachPhoto(e.target.files[0],true);
$('#reportPhoto').onchange=e=>attachPhoto(e.target.files[0],false);

const q=new URLSearchParams(location.search);
if(q.get('e')){
  try{
    const embedded=decodePayload(q.get('e'));
    show(embedded,null,false);
    const embeddedId=first(embedded.evidenceId,embedded.verificationId,embedded.id);
    if(embeddedId!=='Unavailable'){
      fetchRegistry(embeddedId).then(record=>{
        if(record)show({...embedded,...record},null,true);
      });
    }
  }catch{
    $('#scanStatus').textContent='Invalid evidence payload.';
  }
}else if(q.get('id')){
  $('#idInput').value=q.get('id');
  lookup(q.get('id'));
}
