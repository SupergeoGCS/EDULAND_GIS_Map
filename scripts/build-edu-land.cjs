const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
global.self = global;
const shp = require('../dist/vendor/shp.js');
const {unzipSync} = require('../dist/vendor/fflate.js');

async function main() {
  const input = process.argv[2];
  if (!input) throw Error('請指定 EDU_LAND.zip 路徑');
  const entries = unzipSync(fs.readFileSync(input));
  const source = new TextDecoder('utf-8').decode(entries['EDU_LAND.prj']).trim();
  const data = await shp({shp:entries['EDU_LAND.shp'],dbf:entries['EDU_LAND.dbf'],prj:source,cpg:'UTF-8'});
  for (const feature of data.features) {
    const p = feature.properties;
    p['地段名稱'] = `${p.SEC_C || ''}${p.SEC_C ? '段' : ''}${p.SEC_C_SUB ? p.SEC_C_SUB + '小段' : ''}`;
    p['顯示地號'] = p.LAND_NUMBER && /^\d{8}$/.test(p.LAND_NUMBER) ? `${p.LAND_NUMBER.slice(0,4)}-${p.LAND_NUMBER.slice(4)}` : [p.PM_NO,p.PC_NO].filter(Boolean).join('-');
  }
  const app = fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8');
  const start = app.indexOf('function normalizeData(');
  const end = app.indexOf('\nasync function readImport',start);
  const context = vm.createContext({data});
  vm.runInContext(app.slice(start,end)+'\nnormalizeData(data);',context);
  const mapping = {city:'COUNTY_C',district:'TOWN_C',section:'地段名稱',parcel:'顯示地號',area:'REG_AREA',usage:'',manager:'MANAGER',zone:'ZONING_C',category:'LC_LASS_C',owner:'O_NAME',propertyId:''};
  const result = {name:'EDU_LAND 測試地籍',source:'EDU_LAND.zip',encoding:'UTF-8',crs:'EPSG:4326',sourceProjection:source,mapping,data};
  const output = path.join(__dirname,'../dist/data/edu-land.js');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,'window.EDU_LAND_TEST = '+JSON.stringify(result)+';\n','utf8');
  console.log(JSON.stringify({count:data.features.length,cities:[...new Set(data.features.map(f=>f.properties.COUNTY_C))],uniqueLandCodes:new Set(data.features.map(f=>f.properties.LAND_CODE)).size,output}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
