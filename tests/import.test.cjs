const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const appPath = path.join(__dirname, '..', 'dist', 'app.js');
const source = fs.readFileSync(appPath, 'utf8');
function declaration(name, endMarker) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} exists`);
  const brace = source.indexOf('{', start);
  const end = source.indexOf(endMarker, brace);
  if (end < 0) throw new Error(`Could not extract ${name}`);
  return source.slice(start, end).trim();
}
const vendor = path.join(__dirname, '..', 'dist', 'vendor');
global.self = global;
const context = vm.createContext({
  shp: require(path.join(vendor, 'shp.js')),
  fflate: require(path.join(vendor, 'fflate.js')),
  TextDecoder, Uint8Array, ArrayBuffer, JSON, Error, Math, Number, Array,
});
vm.runInContext(`${declaration('normalizeData', '\nasync function readImport')}\nasync ${declaration('readImport', "\n$('import-confirm').onclick")}\nglobalThis.api={normalizeData,readImport};`, context);
const { normalizeData, readImport } = context.api;
const fflate = require(path.join(vendor, 'fflate.js'));
const polygon = (rings) => ({ type: 'Feature', properties: { fixture: '虛構' }, geometry: { type: 'Polygon', coordinates: rings } });
const ring = [[121, 24], [121.01, 24], [121.01, 24.01], [121, 24.01], [121, 24]];

function makeShapeFiles() {
  const points = [[249990,2765780],[250010,2765780],[250010,2765800],[249990,2765800],[249990,2765780]];
  const xs = points.map(p=>p[0]), ys = points.map(p=>p[1]);
  const contentBytes = 4+32+4+4+4+points.length*16;
  function shapeHeader(bytes) {
    const b=Buffer.alloc(100); b.writeInt32BE(9994,0); b.writeInt32BE(bytes/2,24);
    b.writeInt32LE(1000,28); b.writeInt32LE(5,32);
    b.writeDoubleLE(Math.min(...xs),36); b.writeDoubleLE(Math.min(...ys),44);
    b.writeDoubleLE(Math.max(...xs),52); b.writeDoubleLE(Math.max(...ys),60);
    return b;
  }
  const shp=Buffer.concat([shapeHeader(100+8+contentBytes), (()=>{
    const r=Buffer.alloc(8+contentBytes); r.writeInt32BE(1,0); r.writeInt32BE(contentBytes/2,4);
    let o=8; r.writeInt32LE(5,o); o+=4;
    for(const n of [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]){r.writeDoubleLE(n,o);o+=8;}
    r.writeInt32LE(1,o);o+=4;r.writeInt32LE(points.length,o);o+=4;r.writeInt32LE(0,o);o+=4;
    for(const [x,y] of points){r.writeDoubleLE(x,o);r.writeDoubleLE(y,o+8);o+=16;}
    return r;
  })()]);
  const shx=Buffer.concat([shapeHeader(108),(()=>{const b=Buffer.alloc(8);b.writeInt32BE(50,0);b.writeInt32BE(contentBytes/2,4);return b;})()]);
  const dbf=Buffer.alloc(32+32+1+1+7+1);
  dbf[0]=3;dbf.writeUInt32LE(1,4);dbf.writeUInt16LE(65,8);dbf.writeUInt16LE(7,10);
  dbf.write('NAME',32,'ascii');dbf[43]='C'.charCodeAt(0);dbf[48]=6;dbf[64]=0x0d;
  dbf[65]=0x20;Buffer.from([0xbb,0x4f,0xa5,0x5f,0xa5,0xab]).copy(dbf,66);dbf[72]=0x1a;
  const prj=Buffer.from('PROJCS["TWD97 / TM2 zone 121",GEOGCS["GCS_TWD_1997",DATUM["D_TWD_1997",SPHEROID["GRS_1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",121],PARAMETER["scale_factor",0.9999],PARAMETER["false_easting",250000],PARAMETER["false_northing",0],UNIT["Meter",1]]','utf8');
  return { 'fake.shp':shp, 'fake.shx':shx, 'fake.dbf':dbf, 'fake.prj':prj, 'fake.cpg':Buffer.from('950') };
}
const bufferFiles = (entries, omit=[]) => Object.entries(entries).filter(([name])=>!omit.includes(name)).map(([name,data])=>({name,size:data.length,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)}));

test('accepts a valid GeoJSON polygon with an interior ring', () => {
  const feature = polygon([ring, [[121.002,24.002],[121.004,24.002],[121.004,24.004],[121.002,24.004],[121.002,24.002]]]);
  assert.equal(normalizeData({ type: 'FeatureCollection', features: [feature] }).features[0].geometry.coordinates.length, 2);
});
test('rejects coordinates outside WGS84 range', () => {
  assert.throws(() => normalizeData(polygon([[[200,24],[201,24],[201,25],[200,25],[200,24]]])), /WGS84/);
});
test('rejects an unclosed polygon ring', () => {
  assert.throws(() => normalizeData(polygon([ring.slice(0, -1)])), /未封閉/);
});
test('reads a GeoJSON import through readImport', async () => {
  const payload = JSON.stringify({ type: 'FeatureCollection', features: [polygon([ring])] });
  const file = { name: 'fictional.geojson', size: Buffer.byteLength(payload), text: async () => payload };
  const result = await readImport([file], 'auto');
  assert.equal(result.features[0].properties.fixture, '虛構');
});
test('Big5 bytes decode as 臺北市', () => {
  assert.equal(new TextDecoder('big5').decode(Buffer.from([0xbb,0x4f,0xa5,0x5f,0xa5,0xab])), '臺北市');
});
test('reads fictional TWD97 zone 121 SHP ZIP and converts to WGS84 with Big5 attributes', async () => {
  const entries=makeShapeFiles();
  const zipped=fflate.zipSync(Object.fromEntries(Object.entries(entries).map(([n,b])=>[n,new Uint8Array(b)])));
  const result=await readImport([{name:'fictional.zip',size:zipped.length,arrayBuffer:async()=>zipped.buffer.slice(zipped.byteOffset,zipped.byteOffset+zipped.byteLength)}],'auto');
  const feature=normalizeData(result).features[0], [lon,lat]=feature.geometry.coordinates[0][0];
  assert.ok(Math.abs(lon-121)<0.002, `longitude ${lon}`);
  assert.ok(Math.abs(lat-25)<0.002, `latitude ${lat}`);
  assert.equal(feature.properties.NAME.trim(),'臺北市');
});
test('reads same fictional SHP as individual files and rejects missing PRJ', async () => {
  const entries=makeShapeFiles();
  const result=await readImport(bufferFiles(entries),'auto');
  assert.equal(result.features.length,1);
  await assert.rejects(readImport(bufferFiles(entries,['fake.prj']),'auto'),/缺少同名 \.prj/);
});
