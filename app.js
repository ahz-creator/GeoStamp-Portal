const $=s=>document.querySelector(s), rows=$('#rows');
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function decodePayload(raw){try{const u=new URL(raw);raw=u.searchParams.get('e')||raw}catch{};raw=raw.replace(/-/g,'+').replace(/_/g,'/');while(raw.length%4)raw+='=';return JSON.parse(decodeURIComponent(escape(atob(raw))))}
function show(data,thumb){
 $('#result').classList.remove('hidden');
 const risk=!!(data.locationRisk||data.lr);
 const status=data.evidenceStatus||data.status||(risk?'REGISTERED — LOCATION RISK':'REGISTERED EVIDENCE');
 $('#overall').textContent=status;
 $('#overall').style.color=risk?'#ff6666':'#31d17c';
 if(thumb){$('#thumb').src=thumb;$('#thumb').classList.remove('hidden')}
 const captured=data.capturedAt||data.ts||data.timestamp;
 const fields=[
  ['Verification ID',data.verificationId||data.id||'Unavailable'],
  ['Registry',data.registryStatus||'Embedded QR record'],
  ['Captured at',captured?new Date(Number(captured)).toLocaleString():'Unavailable'],
  ['Workspace',data.workspaceMode||data.w||''],
  ['Operator / Location',data.primaryValue||data.p||data.operator||''],
  ['Site / Activity',data.secondaryValue||data.s||data.siteId||''],
  ['Coordinates',`${data.latitude??data.lat??''}, ${data.longitude??data.lon??''}`],
  ['Accuracy',Number.isFinite(Number(data.accuracyM??data.a??data.accuracy))?`${data.accuracyM??data.a??data.accuracy} m`:'Unavailable'],
  ['Location integrity',risk?'Risk recorded':'No mock-location indicator recorded'],
  ['Image SHA-256',data.imageSha256?data.imageSha256:'Not published']
 ];
 rows.innerHTML=fields.map(([k,v])=>`<div class="rowItem"><div class="key">${escapeHtml(k)}</div><div class="value">${escapeHtml(v)}</div></div>`).join('');
 $('#scanStatus').textContent=data.registryStatus?'Public registry record loaded.':'Evidence details loaded from the QR embedded in the received photo.';
}
async function lookup(id){
 const clean=id.trim().toLowerCase();
 if(!clean)return;
 $('#scanStatus').textContent='Searching public registry…';
 try{
  const r=await fetch(`https://raw.githubusercontent.com/ahz-creator/GeoStamp-Config/main/evidence/${encodeURIComponent(clean)}.json?v=${Date.now()}`,{cache:'no-store'});
  if(!r.ok)throw new Error(String(r.status));
  show(await r.json());
 }catch{
  $('#result').classList.add('hidden');
  $('#scanStatus').textContent='No public registry record found. Scan the QR on the GeoStamp photo to open its embedded evidence record.';
 }
}
$('#lookup').onclick=()=>lookup($('#idInput').value);
$('#idInput').addEventListener('keydown',e=>{if(e.key==='Enter')lookup(e.target.value)});
$('#photo').onchange=async e=>{
 const f=e.target.files[0];if(!f)return;
 const thumb=URL.createObjectURL(f);
 if(!('BarcodeDetector'in window)){ $('#scanStatus').textContent='This browser cannot scan QR from an image. Use the phone camera to scan the QR.';return }
 try{
  const bitmap=await createImageBitmap(f);
  const codes=await new BarcodeDetector({formats:['qr_code']}).detect(bitmap);
  if(!codes.length)throw 0;
  const raw=codes[0].rawValue;
  try{
   const u=new URL(raw);
   const id=u.searchParams.get('id');
   if(id){$('#idInput').value=id;await lookup(id);return}
  }catch{}
  const data=decodePayload(raw);
  show(data,thumb);
 }catch{$('#scanStatus').textContent='QR could not be read from this image.'}
};
const q=new URLSearchParams(location.search);
if(q.get('e')){try{show(decodePayload(q.get('e')))}catch{$('#scanStatus').textContent='Invalid evidence payload.'}}
else if(q.get('id')){$('#idInput').value=q.get('id');lookup(q.get('id'))}
