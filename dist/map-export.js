'use strict';
let exportImageURL = null;
let exportInProgress = false;
const exportDialog = $('export-dialog');
const exportStatus = $('export-status');
const exportConfirm = $('export-confirm');
function resetExportPreview(){
 if(exportInProgress)return;
 if(exportImageURL)URL.revokeObjectURL(exportImageURL);exportImageURL=null;
 $('export-preview').hidden=true;$('export-preview').removeAttribute('src');
 $('export-again').hidden=true;$('export-again').removeAttribute('href');
 exportConfirm.textContent='預覽';exportStatus.textContent='';exportStatus.classList.remove('import-error');
}
function exportMapSize(){
 const size=map.getSize(),scale=Number($('export-resolution').value);
 $('export-size').textContent=`地圖區域 ${Math.round(size.x*scale)} × ${Math.round(size.y*scale)} 像素，另附圖名及圖資說明。`;
}
$('export-map').onclick=async()=>{
 if(document.fullscreenElement)await document.exitFullscreen();
 map.stop();resetExportPreview();
 exportMapSize();exportDialog.showModal();
};
$('export-resolution').onchange=()=>{resetExportPreview();exportMapSize();};
$('export-title').oninput=resetExportPreview;
map.on('moveend resize layeradd layerremove',()=>{if(exportDialog.open)resetExportPreview();});
exportDialog.addEventListener('cancel',event=>{if(exportInProgress)event.preventDefault();});
function imageIntersectsMap(image){
 const imageRect=image.getBoundingClientRect(),mapRect=$('map').getBoundingClientRect();
 return imageRect.right>mapRect.left&&imageRect.left<mapRect.right&&imageRect.bottom>mapRect.top&&imageRect.top<mapRect.bottom;
}
async function waitForMapTiles(){
 const deadline=Date.now()+12000;
 while(true){
  let loading=false;map.eachLayer(layer=>{if(layer instanceof L.TileLayer&&layer.isLoading())loading=true;});
  if(!loading)break;
  if(Date.now()>deadline)throw Error('圖磚尚未載入完成，請等待地圖顯示完整後再匯出。');
  await new Promise(resolve=>setTimeout(resolve,120));
 }
 const tiles=[...$('map').querySelectorAll('img.leaflet-tile')].filter(imageIntersectsMap);
 if(!tiles.length||tiles.some(tile=>!tile.complete||tile.naturalWidth===0))throw Error('目前有底圖或套疊圖磚未能載入，請重試或關閉無法連線的圖層。');
 // Preflight the same visible tiles with CORS. Do not silently omit inaccessible images.
 await Promise.all([...new Set(tiles.map(tile=>tile.currentSrc||tile.src))].map(src=>new Promise((resolve,reject)=>{
  const image=new Image();image.crossOrigin='anonymous';
  const timer=setTimeout(()=>{image.onload=image.onerror=null;reject(Error('圖磚讀取逾時，請檢查網路後再匯出。'));},12000);
  image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(Error('圖磚來源未能允許圖片匯出，請切換底圖或關閉該套疊圖層後重試。'));};image.src=src;
 })));
}
function wrapExportText(context,text,width){
 const lines=[];let line='';
 for(const character of text){if(character==='\n'){lines.push(line);line='';continue;}if(line&&context.measureText(line+character).width>width){lines.push(line);line=character;}else line+=character;}
 if(line)lines.push(line);return lines;
}
function buildMapReport(mapCanvas,scale,snapshot){
 const width=map.getSize().x,height=map.getSize().y,pad=20;
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
 const font='"Noto Sans TC", system-ui, sans-serif';
 ctx.font=`600 19px ${font}`;
 const titleLines=wrapExportText(ctx,snapshot.title,width-pad*2);
 const headerHeight=24+titleLines.length*27;
 const legend=map.hasLayer(parcelGroup)?[...new Set(filtered.map(feature=>displayValue(value(feature,'usage'))))]:[];
 const layerNames=overlayRegistry.filter(entry=>map.hasLayer(entry.layer)).map(entry=>entry.name);
 const bounds=snapshot.bounds;
 const metadata=[
  `底圖：${baseNames[snapshot.base]}${layerNames.length?'｜套疊：'+layerNames.join('、'):''}`,
  `地籍：${map.hasLayer(parcelGroup)?importLabel:'未顯示'}${legend.length?'｜使用情形圖例：'+legend.join('、'):''}`,
  ...[...parcelBuffers.values()].filter(entry=>map.hasLayer(entry.layer)).map(entry=>`環域分析：${[value(entry.feature,'city'),value(entry.feature,'district'),value(entry.feature,'section'),value(entry.feature,'parcel')].filter(Boolean).join(' / ')}，以地籍外框中心為圓心，半徑 ${entry.radius.toLocaleString('zh-TW')} 公尺（淡黃色虛線）。`),
  `範圍（WGS84）：西 ${bounds.getWest().toFixed(6)}°、南 ${bounds.getSouth().toFixed(6)}°、東 ${bounds.getEast().toFixed(6)}°、北 ${bounds.getNorth().toFixed(6)}°`,
  `製圖時間：${snapshot.time}（臺灣時間）｜${testDataset?'測試資料，未與最新土地登記資料核驗。':'依匯入資料製圖，未與正式登記資料核驗。'}`,
  `圖資來源：${snapshot.attribution}`
 ];
 ctx.font=`11px ${font}`;
 const metadataLines=metadata.flatMap(text=>wrapExportText(ctx,text,width-pad*2));
 const footerHeight=26+metadataLines.length*19;
 canvas.width=Math.round(width*scale);canvas.height=Math.round((headerHeight+height+footerHeight)*scale);
 const output=canvas.getContext('2d');output.scale(scale,scale);output.fillStyle='#ffffff';output.fillRect(0,0,width,canvas.height/scale);
 output.fillStyle='#244d3e';output.font=`600 19px ${font}`;output.textBaseline='top';
 titleLines.forEach((line,index)=>output.fillText(line,pad,14+index*27));
 output.drawImage(mapCanvas,0,headerHeight,width,height);
 output.strokeStyle='#dae5dd';output.lineWidth=1;output.strokeRect(.5,headerHeight+.5,width-1,height-1);
 output.font=`11px ${font}`;output.fillStyle='#5b7062';metadataLines.forEach((line,index)=>output.fillText(line,pad,headerHeight+height+14+index*19));
 return canvas;
}
exportConfirm.onclick=async()=>{
 if(exportInProgress)return;
 if(exportImageURL){$('export-again').click();exportStatus.textContent='已匯出 PNG 圖片，可再次點選匯出。';return;}
 exportInProgress=true;exportConfirm.disabled=true;exportConfirm.textContent='產生預覽中…';
 exportDialog.querySelectorAll('[data-close],input,select').forEach(control=>control.disabled=true);
 exportStatus.classList.remove('import-error');exportStatus.textContent='正在等待圖磚並製作地圖圖片…';
 $('export-preview').hidden=true;$('export-again').hidden=true;
 try{
  map.stop();await waitForMapTiles();
  if(document.fonts?.ready)await document.fonts.ready;
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const scale=Number($('export-resolution').value);
  const snapshot={title:$('export-title').value.trim()||'教育部學產土地地籍參考圖',base:activeBase,bounds:map.getBounds(),time:new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short',hour12:false}).format(new Date()),attribution:$('map').querySelector('.leaflet-control-attribution')?.textContent.trim()||'國土測繪中心／OpenStreetMap'};
  const mapCanvas=await html2canvas($('map'),{useCORS:true,allowTaint:false,scale,logging:false,imageTimeout:12000,backgroundColor:'#e4ece4',onclone:doc=>{doc.querySelectorAll('dialog').forEach(dialog=>dialog.remove());}});
  const canvas=buildMapReport(mapCanvas,scale,snapshot);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('圖片編碼失敗，請改用標準解析度重試。');
  if(exportImageURL)URL.revokeObjectURL(exportImageURL);exportImageURL=URL.createObjectURL(blob);
  const link=$('export-again');link.href=exportImageURL;link.download=`${snapshot.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,70)}_${new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'})}.png`;
  $('export-preview').src=exportImageURL;if($('export-preview').decode)await $('export-preview').decode();$('export-preview').hidden=false;
  exportStatus.textContent=`預覽完成（${canvas.width} × ${canvas.height} 像素）。確認圖片後，請點選「匯出 PNG 圖片」。`;
 }catch(error){if(exportImageURL)URL.revokeObjectURL(exportImageURL);exportImageURL=null;$('export-preview').hidden=true;exportStatus.classList.add('import-error');exportStatus.textContent=`預覽失敗：${error.message||'請檢查圖資連線或改用標準解析度。'}`;}
 finally{exportInProgress=false;exportConfirm.disabled=false;exportConfirm.textContent=exportImageURL?'匯出 PNG 圖片':'預覽';exportDialog.querySelectorAll('[data-close],input,select').forEach(control=>control.disabled=false);}
};
