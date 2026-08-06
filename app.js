const $=s=>document.querySelector(s);

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

function addRows(target,items){
  $(target).innerHTML=items.map(([k,v,cls])=>
    `<div class="dataRow"><span>${escapeHtml(k)}</span><strong class="${cls||''}">${escapeHtml(v)}</strong></div>`
  ).join('');
}

function confidence(data,registryBacked){
  let score=35;
  const risk=boolValue(data.locationRisk,data.locationIntegrityRisk,data.lr);
  if(first(data.verificationId,data.id)!=='Unavailable')score+=10;
  if(first(data.capturedAt,data.ts,data.timestamp)!=='Unavailable')score+=8;
  if(Number.isFinite(Number(first(data.latitude,data.lat))))score+=8;
  if(Number.isFinite(Number(first(data.longitude,data.lon))))score+=8;
  if(Number.isFinite(Number(first(data.accuracyM,data.accuracy,data.acc))))score+=6;
  if(first(data.imageSha256)!=='Unavailable' && first(data.imageSha256)!=='Not published')score+=8;
  if(first(data.captureSignature)!=='Unavailable')score+=8;
  if(first(data.captureKeyFingerprint)!=='Unavailable')score+=4;
  if(registryBacked)score+=12;
  if(risk)score-=30;
  return Math.max(0,Math.min(100,score));
}

function show(data,thumb,registryBacked=false){
  $('#result').classList.remove('hidden');

  const risk=boolValue(data.locationRisk,data.locationIntegrityRisk,data.lr);
  const id=first(data.verificationId,data.id);
  const captured=first(data.capturedAt,data.ts,data.timestamp);
  const capturedText=captured==='Unavailable'?'Unavailable':new Date(Number(captured)).toLocaleString();
  const primary=first(data.primaryValue,data.operator,data.p);
  const secondary=first(data.secondaryValue,data.siteId,data.s);
  const lat=first(data.latitude,data.lat);
  const lon=first(data.longitude,data.lon);
  const accuracy=first(data.accuracyM,data.accuracy,data.acc);
  const registry=registryBacked||data.registryStatus==='PUBLIC_RECORD'?'Publicly Registered':'Embedded QR Record';
  const score=confidence(data,registryBacked);

  $('#overall').textContent=risk?'REGISTERED — LOCATION RISK':registryBacked?'REGISTERED EVIDENCE':'QR RECORD FOUND';
  $('#conclusion').textContent=risk
    ?'Capture record found; location integrity requires review.'
    :registryBacked
      ?'Public registry record confirmed.'
      :'Structured GeoStamp evidence record decoded from QR.';
  $('#confidenceValue').textContent=`${score}%`;
  $('#confidenceSeal').style.borderColor=risk?'#e35b5b':score>=80?'#35d29a':'#e0aa35';

  $('#evidenceId').textContent=id;
  $('#registryValue').textContent=registry;
  $('#capturedValue').textContent=capturedText;
  $('#primaryValue').textContent=primary;
  $('#secondaryValue').textContent=secondary;

  if(thumb){
    $('#thumb').src=thumb;
    $('#thumb').classList.remove('hidden');
    $('#thumbPlaceholder').classList.add('hidden');
  }else{
    $('#thumb').classList.add('hidden');
    $('#thumbPlaceholder').classList.remove('hidden');
  }

  addRows('#locationRows',[
    ['Coordinates',`${lat}, ${lon}`],
    ['Accuracy',accuracy==='Unavailable'?'Unavailable':`${accuracy} m`],
    ['Location integrity',risk?'Risk recorded':'No mock-location indicator recorded',risk?'findingRisk':'findingPass'],
    ['Workspace',first(data.workspaceMode,data.w)]
  ]);

  addRows('#deviceRows',[
    ['Brand',first(data.deviceBrand,data.brand,data.manufacturer)],
    ['Model',first(data.deviceHardwareModel,data.deviceModel,data.model)],
    ['Device identity',first(data.maskedGeoStampDeviceIdentity,data.geoStampDeviceIdentity)],
    ['Capture key',boolValue(data.captureKeyHardwareBacked)?'Hardware-backed':first(data.captureKeySecurityLevel)],
    ['Capture signature',first(data.captureSignature)==='Unavailable'?'Not available':'Recorded']
  ]);

  const hash=first(data.imageSha256,data.sha256);
  addRows('#integrityRows',[
    ['Registry',registry,registryBacked?'findingPass':'findingReview'],
    ['Image SHA-256',hash==='Unavailable'?'Not published':hash],
    ['Capture signature',first(data.captureSignature)==='Unavailable'?'Not available':'Recorded',
      first(data.captureSignature)==='Unavailable'?'findingReview':'findingPass'],
    ['Overall finding',risk?'Review required':score>=80?'High confidence':'Limited confidence',
      risk?'findingRisk':score>=80?'findingPass':'findingReview']
  ]);

  const now=new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  const events=[
    ['Captured',capturedText==='Unavailable'?'—':new Date(Number(captured)).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})],
    ['Hash',hash==='Unavailable'?'Not available':'Recorded'],
    ['Signed',first(data.captureSignature)==='Unavailable'?'Not available':'Recorded'],
    ['Registry',registryBacked?'Confirmed':'Not confirmed'],
    ['Verified',now]
  ];
  $('#timelineRows').innerHTML=events.map(([name,value])=>
    `<div class="timelineItem"><strong>${escapeHtml(name)}</strong>${escapeHtml(value)}</div>`
  ).join('');

  $('#scanStatus').textContent=registryBacked?'Public registry record loaded.':'Embedded QR evidence loaded.';
}

async function lookup(id){
  const clean=id.trim().toLowerCase();
  if(!clean)return;
  $('#scanStatus').textContent='Searching public registry…';
  try{
    const r=await fetch(
      `https://raw.githubusercontent.com/ahz-creator/GeoStamp-Config/main/evidence/${encodeURIComponent(clean)}.json?v=${Date.now()}`,
      {cache:'no-store'}
    );
    if(!r.ok)throw new Error(String(r.status));
    show(await r.json(),null,true);
  }catch{
    $('#result').classList.add('hidden');
    $('#scanStatus').textContent='No public registry record found. Check the Evidence ID or scan the QR on the received photo.';
  }
}

$('#lookup').onclick=()=>lookup($('#idInput').value);
$('#idInput').addEventListener('keydown',e=>{if(e.key==='Enter')lookup(e.target.value)});

$('#photo').onchange=async e=>{
  const f=e.target.files[0];
  if(!f)return;
  const thumb=URL.createObjectURL(f);
  if(!('BarcodeDetector' in window)){
    $('#scanStatus').textContent='This browser cannot scan QR from an image. Use the phone camera to scan the QR.';
    return;
  }
  try{
    const bitmap=await createImageBitmap(f);
    const codes=await new BarcodeDetector({formats:['qr_code']}).detect(bitmap);
    if(!codes.length)throw 0;
    const raw=codes[0].rawValue;
    try{
      const u=new URL(raw);
      const id=u.searchParams.get('id');
      const embedded=u.searchParams.get('e');
      if(embedded){
        const data=decodePayload(embedded);
        show(data,thumb,false);
        const embeddedId=first(data.verificationId,data.id);
        if(embeddedId!=='Unavailable'){
          try{
            const r=await fetch(`https://raw.githubusercontent.com/ahz-creator/GeoStamp-Config/main/evidence/${encodeURIComponent(String(embeddedId).toLowerCase())}.json?v=${Date.now()}`,{cache:'no-store'});
            if(r.ok)show(await r.json(),thumb,true);
          }catch{}
        }
        return;
      }
      if(id){
        $('#idInput').value=id;
        const r=await fetch(`https://raw.githubusercontent.com/ahz-creator/GeoStamp-Config/main/evidence/${encodeURIComponent(id.toLowerCase())}.json?v=${Date.now()}`,{cache:'no-store'});
        if(!r.ok)throw 0;
        show(await r.json(),thumb,true);
        return;
      }
    }catch{}
    show(decodePayload(raw),thumb,false);
  }catch{
    $('#scanStatus').textContent='QR could not be read from this image.';
  }
};

const q=new URLSearchParams(location.search);
if(q.get('e')){
  try{show(decodePayload(q.get('e')),null,false)}
  catch{$('#scanStatus').textContent='Invalid evidence payload.'}
}else if(q.get('id')){
  $('#idInput').value=q.get('id');
  lookup(q.get('id'));
}
