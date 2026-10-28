'use strict';
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const displayValue = value => value === null || value === undefined || value === '' ? '未提供' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const fields = {city:'縣市',district:'鄉鎮市區',section:'地段',parcel:'地號',area:'登記面積',usage:'使用情形',manager:'管理單位',zone:'使用分區',category:'使用地類別',owner:'所有權人',propertyId:'財產編號'};
const aliases = {city:['縣市','縣市名稱','COUNTYNAME','COUNTY','CITY'],district:['鄉鎮市區','鄉鎮區','TOWNNAME','TOWN','DISTRICT'],section:['地段','段名','地段名稱','SECTNAME','SECTION'],parcel:['地號','土地地號','LANDNO','LAND_NO','PARCEL'],area:['登記面積','面積','AREA','LAND_AREA'],usage:['使用情形','使用狀態','USE_TYPE','USAGE'],manager:['管理單位','管理機關','MANAGER'],zone:['使用分區','ZONE'],category:['使用地類別','CATEGORY'],owner:['所有權人','OWNER'],propertyId:['財產編號','PROPERTY_ID']};
const colors = {'出租':'#bd934d','自用':'#3c9a7c','占用':'#c77465','未利用':'#738fb2','未提供':'#82968c'};
let dataset, filtered = [], mapping = {}, selected = null, demo = true, pending = null, pickedFiles = [], busy = false, measuring = false, measurePoints = [], measureLayer;
let toastTimer, baseErrors = 0, tileTimer, importLabel = '';
const map = L.map('map',{zoomControl:false,minZoom:6,maxZoom:22,preferCanvas:true}).setView([25.0318,121.5172],16);
L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
const nlsc = code => `https://wmts.nlsc.gov.tw/wmts/${code}/default/GoogleMapsCompatible/{z}/{y}/{x}`;
const nlscCredit = '<a href="https://maps.nlsc.gov.tw/" target="_blank" rel="noopener">國土測繪中心</a>';
const bases = {
 emap:L.tileLayer(nlsc('EMAP'),{maxNativeZoom:19,maxZoom:22,attribution:nlscCredit}),
 photo:L.tileLayer(nlsc('PHOTO2'),{maxNativeZoom:19,maxZoom:22,attribution:nlscCredit}),
 osm:L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxNativeZoom:19,maxZoom:22,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'})
};
let activeBase = 'emap'; bases.emap.addTo(map);
const baseNames = {emap:'國土測繪中心電子地圖',photo:'國土測繪中心正射影像',osm:'OpenStreetMap'};
for(const [key,layer] of Object.entries(bases)){
 layer.on('tileerror',()=>{if(activeBase!==key)return;baseErrors++;clearTimeout(tileTimer);tileTimer=setTimeout(()=>{if(baseErrors>2){$('base-status').textContent='底圖連線異常，請切換底圖或檢查網路';toast('部分底圖未能載入，可嘗試切換其他底圖。');}},1500);});
}
const parcelGroup = L.geoJSON(null,{style:feature=>parcelStyle(feature),onEachFeature:(feature,layer)=>{
 layer.on('click',event=>{if(!measuring){L.DomEvent.stopPropagation(event);selectFeature(feature);}});
 layer.on('mouseover',()=>{if(feature!==selected)layer.setStyle({weight:3,fillOpacity:.5});});
 layer.on('mouseout',()=>layer.setStyle(parcelStyle(feature)));
 layer.bindTooltip(escapeHTML(value(feature,'parcel')||'未提供地號'),{permanent:true,direction:'center',className:'parcel-label'});
}}).addTo(map);
const labelPane = map.createPane('reference');labelPane.style.zIndex=350;
const overlayDefinitions = [['LANDSECT','地段外圍圖',18],['LUIMAP','國土利用現況調查成果圖',18],['CITY','縣市界',17],['TOWN','鄉鎮區界',17],['Village','村里界',19],['SCHOOL','各級學校範圍',19]];
for(const [code,name,max] of overlayDefinitions){
 const layer=L.tileLayer(nlsc(code),{maxNativeZoom:max,maxZoom:22,opacity:.65,attribution:nlscCredit,pane:'reference'});
 addOverlayControl(name,layer,`國土測繪中心 · ${code}`);
 let warned=false;layer.on('tileerror',()=>{if(!warned&&map.hasLayer(layer)){warned=true;toast(`${name}服務暫時無法載入，請稍後再試。`);}});
}
function addOverlayControl(name,layer,subtitle='本機匯入 · 工作階段資料'){
 const label=document.createElement('label');label.className='layer-toggle';
 const check=document.createElement('input');check.type='checkbox';check.addEventListener('change',()=>check.checked?layer.addTo(map):map.removeLayer(layer));
 const span=document.createElement('span');const bold=document.createElement('b');bold.textContent=name;const small=document.createElement('small');small.textContent=subtitle;span.append(bold,small);label.append(check,span);$('overlays').append(label);return check;
}
function value(feature,key){const column=mapping[key];return column?feature.properties?.[column]:undefined;}
function usageColor(feature){return colors[value(feature,'usage')]||'#7a9a89';}
function parcelStyle(feature){return {color:feature===selected?'#193f38':usageColor(feature),weight:feature===selected?3.5:2,fillColor:usageColor(feature),fillOpacity:Number($('opacity').value)/100};}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
function demoData(){
 const features=[];const uses=['自用','出租','未利用','自用','占用','出租','自用','未利用'];
 for(let i=0;i<8;i++){
  const x=121.5128+(i%4)*.0028,y=25.0340-Math.floor(i/4)*.0034;
  features.push({type:'Feature',properties:{'縣市':'臺北市','鄉鎮市區':'中正區','地段':'示範段','地號':`${String(120+i*11).padStart(4,'0')}-0000`,'登記面積':[1635,2080,1850,3250,1420,2760,1940,2340][i],'使用情形':uses[i],'管理單位':'教育部（示範）','使用分區':'示範使用分區','使用地類別':'示範類別','所有權人':'中華民國（示範）','財產編號':`DEMO-${String(i+1).padStart(3,'0')}`,'資料說明':'虛構圖形及屬性，非實際學產範圍或登記資料'},geometry:{type:'Polygon',coordinates:[[[x,y],[x+.0016,y+.00015],[x+.0018,y-.00115],[x+.00015,y-.00135],[x,y]]]}});
 }
 return {type:'FeatureCollection',features};
}
function loadDataset(data,newMapping,isDemo,label){
 dataset=data;mapping=newMapping;demo=isDemo;selected=null;$('details').hidden=true;importLabel=label;
 $('source-label').textContent=isDemo?'目前顯示示範資料':'已匯入地籍資料';
 $('source-description').textContent=isDemo?'8 筆虛構地籍，僅供功能展示':`${data.features.length.toLocaleString()} 筆地籍 · ${label}`;
 $('map-source').textContent=isDemo?'示範資料':'本機匯入';
 $('dataset-status').textContent=isDemo?'示範圖層 · 瀏覽器工作階段':`${label} · 重新整理即清除`;
 $('keyword').value='';populateSelect('city',data.features);updateDistrict();populateSelect('usage',data.features);applySearch();
 $('parcels-toggle').checked=true;if(!map.hasLayer(parcelGroup))parcelGroup.addTo(map);fitResults();
}
function populateSelect(id,features){
 const previous=$(id).value;const placeholder={city:'全部縣市',district:'全部鄉鎮區',section:'全部地段',usage:'全部使用情形'}[id];
 $(id).replaceChildren(new Option(placeholder,''));
 [...new Set(features.map(f=>value(f,id)).filter(v=>v!==undefined&&v!==null&&v!=='').map(String))].sort((a,b)=>a.localeCompare(b,'zh-Hant')).forEach(v=>$(id).add(new Option(v,v)));
 if([...$(id).options].some(o=>o.value===previous))$(id).value=previous;
}
function updateDistrict(){const subset=dataset.features.filter(f=>!$('city').value||String(value(f,'city'))===$('city').value);populateSelect('district',subset);updateSection();}
function updateSection(){const subset=dataset.features.filter(f=>(!$('city').value||String(value(f,'city'))===$('city').value)&&(!$('district').value||String(value(f,'district'))===$('district').value));populateSelect('section',subset);}
$('city').onchange=()=>{$('district').value='';$('section').value='';updateDistrict();};$('district').onchange=()=>{$('section').value='';updateSection();};
function applySearch(){
 const keyword=$('keyword').value.trim().toLocaleLowerCase();
 filtered=dataset.features.filter(f=>['city','district','section','usage'].every(k=>!$(k).value||String(value(f,k))===$(k).value)&&(!keyword||Object.values(f.properties||{}).some(v=>displayValue(v).toLocaleLowerCase().includes(keyword))));
 if(selected&&!filtered.includes(selected)){selected=null;$('details').hidden=true;}
 parcelGroup.clearLayers().addData({type:'FeatureCollection',features:filtered});setLabels();renderResults();renderLegend();
 $('result-count').textContent=filtered.length.toLocaleString();$('visible-count').textContent=filtered.length.toLocaleString();$('table-count').textContent=`${filtered.length.toLocaleString()} 筆`;
}
function renderResults(){
 $('results').replaceChildren();$('table-body').replaceChildren();
 if(!filtered.length)$('results').innerHTML='<div class="empty">沒有符合條件的地籍<br>請調整條件後重新查詢。</div>';
 filtered.slice(0,250).forEach((feature,index)=>{
  const button=document.createElement('button');button.className=`result-card${feature===selected?' selected':''}`;
  button.innerHTML=`<div><b>${escapeHTML(displayValue(value(feature,'parcel')))}</b><span class="usage-badge" style="color:${usageColor(feature)}">${escapeHTML(displayValue(value(feature,'usage')))}</span></div><small>${escapeHTML([value(feature,'city'),value(feature,'district'),value(feature,'section')].filter(Boolean).join(' · ')||'未提供行政區資訊')}</small>`;
  button.onclick=()=>selectFeature(feature);$('results').append(button);
  const row=document.createElement('tr');row.tabIndex=0;row.setAttribute('aria-label',`查看地籍 ${displayValue(value(feature,'parcel'))}`);
  for(const text of [value(feature,'parcel'),[value(feature,'city'),value(feature,'district')].filter(Boolean).join(' / '),value(feature,'section'),value(feature,'area'),value(feature,'usage'),value(feature,'manager')]){const td=document.createElement('td');td.textContent=displayValue(text);row.append(td);}
  row.onclick=()=>selectFeature(feature);row.onkeydown=e=>{if(e.key==='Enter')selectFeature(feature);};$('table-body').append(row);
 });
 if(filtered.length>250){const p=document.createElement('p');p.className='hint';p.textContent='清單顯示前 250 筆；地圖及匯出包含全部查詢結果，請縮小條件。';$('results').append(p);}
}
function renderLegend(){
 const unique=[...new Set(filtered.map(f=>displayValue(value(f,'usage'))))];const html=unique.map(v=>`<div class="legend-row"><i class="legend-dot" style="background:${colors[v]||'#7a9a89'}"></i>${escapeHTML(v)}</div>`).join('');
 $('legend').innerHTML=html;$('legend-sidebar').innerHTML=html;
}
function setLabels(){parcelGroup.eachLayer(layer=>{if($('labels-toggle').checked)layer.openTooltip();else layer.closeTooltip();});}
function fitResults(){if(filtered.length){const bounds=parcelGroup.getBounds();if(bounds.isValid())map.fitBounds(bounds,{padding:[55,55],maxZoom:17});}else toast('目前沒有可定位的查詢結果。');}
function selectFeature(feature){
 selected=feature;parcelGroup.eachLayer(layer=>{layer.setStyle(parcelStyle(layer.feature));if(layer.feature===feature){layer.bringToFront();map.fitBounds(layer.getBounds(),{paddingTopLeft:[35,70],paddingBottomRight:[Math.min(390,map.getSize().x*.45),45],maxZoom:18});}});
 const content=$('detail-content');content.replaceChildren();
 const heading=document.createElement('h2');heading.textContent=displayValue(value(feature,'parcel'));content.append(heading);
 const loc=document.createElement('p');loc.className='detail-location';loc.textContent=[value(feature,'city'),value(feature,'district'),value(feature,'section')].filter(Boolean).join(' / ')||'未提供位置資訊';content.append(loc);
 const badge=document.createElement('span');badge.className='usage-badge';badge.textContent=displayValue(value(feature,'usage'));content.append(badge);
 const tab=document.createElement('div');tab.className='detail-tabs';tab.textContent='土地標示部';content.append(tab);
 const list=document.createElement('dl');list.className='property-list';
 for(const key of ['city','district','section','parcel','zone','category','owner','manager','propertyId']){const row=document.createElement('div');const dt=document.createElement('dt');dt.textContent=fields[key];const dd=document.createElement('dd');dd.textContent=displayValue(value(feature,key));row.append(dt,dd);list.append(row);}content.append(list);
 const area=document.createElement('div');area.className='detail-area';const numeric=Number(value(feature,'area'));const formatted=value(feature,'area')!==undefined&&value(feature,'area')!==null&&value(feature,'area')!==''&&Number.isFinite(numeric)?numeric.toLocaleString('zh-TW',{maximumFractionDigits:2}):'未提供';
 area.innerHTML=`<span>登記面積</span><span><b>${escapeHTML(formatted)}</b> <small>m²</small></span>`;content.append(area);
 const raw=document.createElement('details');raw.className='raw-details';const summary=document.createElement('summary');summary.textContent='查看全部原始屬性';raw.append(summary);const rawList=document.createElement('dl');rawList.className='property-list';
 for(const [key,v] of Object.entries(feature.properties||{})){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=displayValue(v);row.append(dt,dd);rawList.append(row);}raw.append(rawList);content.append(raw);
 const hint=document.createElement('p');hint.className='hint';hint.textContent=demo?'此為虛構展示資料，非正式土地登記資料。':'屬性來自匯入檔案，未與正式土地登記資料核驗。';content.append(hint);$('details').hidden=false;renderResults();
}
$('search-form').onsubmit=e=>{e.preventDefault();applySearch();fitResults();};$('fit-results').onclick=fitResults;
$('reset').onclick=()=>{['city','district','section','keyword','usage'].forEach(k=>$(k).value='');updateDistrict();applySearch();fitResults();};
$('close-details').onclick=()=>{selected=null;$('details').hidden=true;parcelGroup.setStyle(parcelStyle);renderResults();};
document.querySelectorAll('[data-panel]').forEach(button=>button.onclick=()=>{const id=button.dataset.panel;document.querySelectorAll('[data-panel]').forEach(b=>b.classList.toggle('active',b===button));$('query-panel').hidden=id!=='query';$('layers-panel').hidden=id!=='layers';if(innerWidth<601)$('sidebar').scrollIntoView({behavior:'smooth',block:'start'});});
document.querySelectorAll('[data-base]').forEach(button=>button.onclick=()=>{map.removeLayer(bases[activeBase]);activeBase=button.dataset.base;bases[activeBase].addTo(map);baseErrors=0;clearTimeout(tileTimer);$('base-status').textContent=`底圖：${baseNames[activeBase]}`;document.querySelectorAll('[data-base]').forEach(b=>b.classList.toggle('selected',b===button));});
$('parcels-toggle').onchange=e=>e.target.checked?parcelGroup.addTo(map):map.removeLayer(parcelGroup);
$('labels-toggle').onchange=setLabels;$('opacity').oninput=()=>{$('opacity-value').value=`${$('opacity').value}%`;parcelGroup.setStyle(parcelStyle);};
$('zoom-in').onclick=()=>map.zoomIn();$('zoom-out').onclick=()=>map.zoomOut();$('home').onclick=()=>map.setView([23.7,120.95],7);
map.on('mousemove',e=>$('coordinates').textContent=`經度 ${e.latlng.lng.toFixed(6)}°　緯度 ${e.latlng.lat.toFixed(6)}°`);map.on('zoomend',()=>$('zoom-level').textContent=map.getZoom());
$('locate').onclick=()=>{if(!navigator.geolocation){toast('此瀏覽器不支援位置定位。');return;}navigator.geolocation.getCurrentPosition(pos=>{const p=[pos.coords.latitude,pos.coords.longitude];map.setView(p,17);L.circle(p,{radius:pos.coords.accuracy,color:'#377eaf',weight:1,fillOpacity:.12}).addTo(map).bindPopup('目前定位位置（含定位誤差範圍）').openPopup();},()=>toast('無法取得位置，請確認瀏覽器的位置權限與 HTTPS 連線。'),{timeout:10000});};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.querySelector('.map-stage').requestFullscreen();setTimeout(()=>map.invalidateSize(),100);}catch{toast('此瀏覽器無法使用全螢幕模式。');}};
$('measure').onclick=()=>{measuring=!measuring;$('measure').classList.toggle('active',measuring);$('measure-hint').hidden=!measuring;map.getContainer().style.cursor=measuring?'crosshair':'';if(measuring){measurePoints=[];if(measureLayer)map.removeLayer(measureLayer);measureLayer=L.polyline([],{color:'#244f40',dashArray:'5 5',weight:3}).addTo(map);}else if(measurePoints.length<2&&measureLayer)map.removeLayer(measureLayer);};
map.on('click',e=>{if(!measuring)return;measurePoints.push(e.latlng);measureLayer.setLatLngs(measurePoints);let distance=0;for(let i=1;i<measurePoints.length;i++)distance+=map.distance(measurePoints[i-1],measurePoints[i]);measureLayer.bindTooltip(distance>=1000?`${(distance/1000).toFixed(2)} 公里`:`${distance.toFixed(1)} 公尺`,{permanent:true}).openTooltip();});
function toggleTable(open){$('table-panel').hidden=!open;document.querySelector('.map-stage').classList.toggle('table-open',open);$('table-toggle').setAttribute('aria-expanded',String(open));}
$('table-toggle').onclick=()=>toggleTable($('table-panel').hidden);$('close-table').onclick=()=>toggleTable(false);
$('help').onclick=()=>$('help-dialog').showModal();document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
function openImport(){if(document.fullscreenElement)document.exitFullscreen();$('import-dialog').showModal();}
$('import-button').onclick=openImport;$('import-nav').onclick=openImport;
$('download').onclick=()=>{if(!filtered.length){toast('沒有可匯出的查詢結果。');return;}const data={type:'FeatureCollection',name:demo?'虛構示範地籍':importLabel,features:filtered};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/geo+json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`${demo?'示範':'匯入'}地籍查詢結果.geojson`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function pickFiles(files){pickedFiles=[...files];$('import-status').classList.remove('import-error');$('import-status').textContent=pickedFiles.map(f=>f.name).join('、');$('import-confirm').disabled=!pickedFiles.length||busy;}
$('files').onchange=e=>pickFiles(e.target.files);$('dropzone').ondragover=e=>{e.preventDefault();};$('dropzone').ondrop=e=>{e.preventDefault();pickFiles(e.dataTransfer.files);};
function normalizeData(input,polygonOnly=true){
 const collections=Array.isArray(input)?input:[input];const features=collections.flatMap(data=>data?.type==='FeatureCollection'?data.features:data?.type==='Feature'?[data]:[]);
 if(!features.length)throw Error('檔案中沒有可讀取的圖徵。');if(features.length>20000)throw Error('單次最多支援 20,000 筆圖徵；大型資料請先分區或轉為向量圖磚。');
 function checkCoordinates(coords){if(!Array.isArray(coords)||coords.length===0)throw Error('圖形包含空白或無效座標。');if(typeof coords[0]==='number'){if(coords.length<2||!Number.isFinite(coords[0])||!Number.isFinite(coords[1])||Math.abs(coords[0])>180||Math.abs(coords[1])>90)throw Error('座標超出 WGS84 經緯度範圍；請確認 .prj 或先轉換為 EPSG:4326。');}else coords.forEach(checkCoordinates);}
 function geometry(g){if(!g)throw Error('檔案包含空白圖形，請先清理資料。');if(g.type==='GeometryCollection'){if(polygonOnly)throw Error('地籍僅接受 Polygon 或 MultiPolygon。');g.geometries.forEach(geometry);return;}if(!['Point','MultiPoint','LineString','MultiLineString','Polygon','MultiPolygon'].includes(g.type))throw Error('不支援此圖形類型。');if(polygonOnly&&!['Polygon','MultiPolygon'].includes(g.type))throw Error('地籍僅接受 Polygon 或 MultiPolygon；其他資料請選擇「參考圖資」。');checkCoordinates(g.coordinates);if(g.type==='Polygon'||g.type==='MultiPolygon'){const polygons=g.type==='Polygon'?[g.coordinates]:g.coordinates;for(const polygon of polygons)for(const ring of polygon){if(ring.length<4||ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])throw Error('多邊形包含未封閉或少於四點的環，請先修復圖形。');}}}
 features.forEach(f=>{if(f.type!=='Feature')throw Error('資料不是有效的 GeoJSON Feature。');geometry(f.geometry);f.properties=f.properties&&typeof f.properties==='object'&&!Array.isArray(f.properties)?f.properties:{};});return {type:'FeatureCollection',features};
}
async function readImport(files,encoding){
 const total=files.reduce((n,f)=>n+f.size,0);if(total>20*1024*1024)throw Error('檔案合計超過 20 MB，請分批處理。');
 const json=files.find(f=>/\.(geojson|json)$/i.test(f.name));if(json){if(files.length!==1)throw Error('GeoJSON 請一次選取一個檔案。');return JSON.parse(await json.text());}
 const zip=files.find(f=>/\.zip$/i.test(f.name));let entries={};
 if(zip){if(files.length!==1)throw Error('ZIP 請一次選取一個檔案。');let expanded=0;entries=fflate.unzipSync(new Uint8Array(await zip.arrayBuffer()),{filter:entry=>{expanded+=entry.originalSize;if(expanded>100*1024*1024)throw Error('ZIP 解壓縮後超過 100 MB，請縮小資料。');return /\.(shp|shx|dbf|prj|cpg)$/i.test(entry.name)&&!entry.name.startsWith('__MACOSX/');}});}else{for(const file of files)entries[file.name]=new Uint8Array(await file.arrayBuffer());}
 const shpNames=Object.keys(entries).filter(n=>/\.shp$/i.test(n));if(shpNames.length!==1)throw Error('請提供單一 SHP 圖層及其附屬檔案。');
 const stem=shpNames[0].slice(0,-4).toLowerCase();const get=extension=>entries[Object.keys(entries).find(n=>n.toLowerCase()===`${stem}.${extension}`)];
 for(const ext of ['shx','dbf','prj'])if(!get(ext))throw Error(`缺少同名 .${ext}，請將 .shp、.shx、.dbf、.prj 一起提供。`);
 const decode=buffer=>new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/,'').trim();const prj=decode(get('prj'));if(!prj)throw Error('.prj 為空白，無法確認來源座標系統。');
 let cpg=encoding==='auto'?(get('cpg')?decode(get('cpg')):'UTF-8'):encoding;if(/^(950|CP950)$/i.test(cpg))cpg='Big5';if(/^(65001|UTF8)$/i.test(cpg))cpg='UTF-8';
 return await shp({shp:get('shp'),dbf:get('dbf'),prj,cpg});
}
$('import-confirm').onclick=async()=>{
 if(busy)return;busy=true;$('import-confirm').disabled=true;$('import-status').classList.remove('import-error');$('import-status').textContent='正在讀取、轉換座標與檢查圖形…';
 try{
  await new Promise(resolve=>setTimeout(resolve,30));const reference=$('import-role').value==='overlay';const data=normalizeData(await readImport(pickedFiles,$('encoding').value),!reference);const name=pickedFiles.find(f=>/\.(shp|zip|geojson|json)$/i.test(f.name))?.name||'匯入圖資';
  if(reference){const layer=L.geoJSON(data,{style:{color:'#8774ad',weight:2,fillOpacity:.15},pointToLayer:(_,latlng)=>L.circleMarker(latlng,{radius:5,color:'#8774ad'}),onEachFeature:(f,l)=>{const div=document.createElement('div');div.textContent=Object.entries(f.properties).map(([k,v])=>`${k}：${displayValue(v)}`).join('\n');div.style.whiteSpace='pre-wrap';l.bindPopup(div);}});const check=addOverlayControl(name,layer);check.checked=true;layer.addTo(map);map.fitBounds(layer.getBounds(),{padding:[40,40],maxZoom:17});$('import-dialog').close();toast(`已加入參考圖層：${name}`);
  }else{pending={data,name};showMapping();}
 }catch(error){$('import-status').classList.add('import-error');$('import-status').textContent=`匯入失敗：${error.message||'請檢查檔案格式、編碼與座標系統。'}`;}
 finally{busy=false;$('import-confirm').disabled=!pickedFiles.length;}
};
function showMapping(){
 const columns=[...new Set(pending.data.features.flatMap(f=>Object.keys(f.properties)))];$('mapping-description').textContent=`${pending.name} · ${pending.data.features.length.toLocaleString()} 筆圖徵 · ${columns.length} 個欄位`;$('mapping-fields').replaceChildren();
 for(const [key,label] of Object.entries(fields)){const wrapper=document.createElement('label');wrapper.textContent=label;const select=document.createElement('select');select.dataset.field=key;select.add(new Option('未對應',''));columns.forEach(c=>select.add(new Option(c,c)));const match=columns.find(c=>aliases[key]?.some(a=>a.toLocaleLowerCase()===c.toLocaleLowerCase()));if(match)select.value=match;wrapper.append(select);$('mapping-fields').append(wrapper);}
 $('import-dialog').close();$('mapping-dialog').showModal();
}
$('apply-mapping').onclick=()=>{const mapped=Object.fromEntries([...document.querySelectorAll('[data-field]')].map(s=>[s.dataset.field,s.value]));loadDataset(pending.data,mapped,false,pending.name);$('mapping-dialog').close();toast('地籍已加入地圖，可開始查詢與檢視屬性。');pending=null;};
$('load-demo').onclick=()=>{loadDataset(demoData(),Object.fromEntries(Object.entries(fields).map(([key,label])=>[key,label])),true,'示範地籍');$('import-dialog').close();toast('已還原虛構示範地籍。');};
loadDataset(demoData(),Object.fromEntries(Object.entries(fields).map(([key,label])=>[key,label])),true,'示範地籍');
window.MOEGIS={loadGeoJSON:(geojson,fieldMapping)=>loadDataset(normalizeData(geojson),fieldMapping||{},false,'API 載入資料'),getFiltered:()=>structuredClone({type:'FeatureCollection',features:filtered}),map};
