# 教育部學產 GIS 地圖展示模組

以 Leaflet 1.9.4 建立的獨立靜態 Web GIS。所有文字檔採 UTF-8。預設載入使用者提供的 EDU_LAND.zip 測試資料，共 53 筆地籍、53 個不重複 LAND_CODE，涵蓋臺北市、基隆市、桃園市、苗栗縣。原有 8 筆虛構地籍已移除。

## 內建測試地籍

`dist/data/edu-land.js` 為從來源 ZIP 轉出的 WGS84 圖形及完整原始屬性，網站載入及重新整理皆自動使用此資料。來源 .prj 為 WGS84 longlat；屬性欄位 EPSG=3826 僅保留原始值，不用它重複轉換幾何座標。DBF 實際為 UTF-8，來源未附 .cpg。

欄位對應為 COUNTY_C（縣市）、TOWN_C（鄉鎮區）、SEC_C + SEC_C_SUB（地段／小段）、LAND_NUMBER（8 碼地號顯示為 4-4 碼）、REG_AREA（登記面積平方公尺）、MANAGER（管理單位）、ZONING_C（使用分區）、LC_LASS_C（使用地類別）、O_NAME（所有權人）。原始欄位均保留；沒有使用情形或財產編號欄位，介面顯示「未提供」，不以 SID 或登記原因替代。新增「地段名稱」及「顯示地號」兩欄作介面顯示用途。

更新資料可執行 `node scripts/build-edu-land.cjs <EDU_LAND.zip完整路徑>`。程式會檢查地籍圖形、經緯度範圍及封閉環，並重建內建資料。此資料供測試展示，未與最新土地登記資料核驗。

## 執行與部署

在本目錄執行 `node serve.mjs`，開啟 http://127.0.0.1:4173 。正式環境可將 `dist/` 部署於 HTTPS 靜態網站或既有系統的獨立路徑。Leaflet、shpjs 6.1.0、fflate 0.8.2 已固定版本存於 `dist/vendor/`；底圖需要對外網路。字型服務無法連線時自動使用系統字型。

## 已實作功能

- 國土測繪中心 EMAP 電子地圖、PHOTO2 正射影像、OSM 三種底圖。
- 地段外圍圖（LANDSECT）、國土利用現況調查成果圖（LUIMAP）、縣市界（CITY）、鄉鎮區界（TOWN）、村里界（Village）及各級學校範圍（SCHOOL）各自獨立開關的 WMTS 套疊；村里界依官方大小寫使用 Village。
- 縣市 → 鄉鎮區 → 地段連動、地號與全屬性關鍵字查詢、使用情形篩選。
- 查詢清單、地圖選取、土地標示部與全部原始屬性連動。
- 每筆土地明細提供「在 Google 地圖查看」外部連結，以該筆地籍外框中心的 WGS84 緯度、經度自動建立 Google Maps URL，另開分頁；適用於內建測試及匯入地籍。
- 地籍外框、透明度、地號標籤、圖例、屬性表格、GeoJSON 匯出。
- 本機 SHP ZIP、SHP 附屬檔案、WGS84 GeoJSON 匯入；地籍或參考套疊用途。
- .prj 座標轉換、UTF-8 / Big5 選擇、.cpg 編碼讀取、地籍欄位對應。
- 全臺範圍、查詢結果定位、目前位置、球面距離量測、全螢幕與行動版排版。

## 後續提供 SHP 的格式

一個圖層請包含同名 `.shp`、`.shx`、`.dbf`、`.prj`，建議加上 `.cpg`。可一起選取或壓為 ZIP。地籍接受 Polygon / MultiPolygon，包含內環；其他類型請用參考圖資匯入。不同圖層分開匯入。單次壓縮檔／檔案合計限制 20 MB、解壓縮後 100 MB、圖徵 20,000 筆。大型地籍建議後續採後端空間查詢與向量圖磚。

GeoJSON 必須為 WGS84 經緯度（經度、緯度順序）；投影座標請先轉換。SHP 必須附正確 .prj，TWD97 121 / 119 分帶不可混用；目前尚待以使用者正式資料驗證。DBF 文字若未附 .cpg，預設 UTF-8；舊資料可在匯入時選 Big5。登記面積欄位請以平方公尺提供；此欄位呈現原始登記值，不自動以圖形面積替代。

可對應欄位：縣市、鄉鎮市區、地段、地號、登記面積、使用情形、管理單位、使用分區、使用地類別、所有權人、財產編號。未對應欄位顯示「未提供」，全部原始屬性仍保留。每次地籍匯入取代當前地籍；參考圖資可累加套疊。瀏覽清單及表格顯示前 250 筆，地圖及匯出包含所有查詢結果。

## 既有系統整合預留

`dist/app.js` 公開 `window.MOEGIS.loadGeoJSON(geojson, fieldMapping)` 及 `getFiltered()`。正式 API 需先由既有系統認證授權，回傳 GeoJSON 與欄位對應；不要直接把資料庫帳密放在前端。欄位對應鍵為 `city, district, section, parcel, area, usage, manager, zone, category, owner, propertyId`。

```js
window.MOEGIS.loadGeoJSON(featureCollection, {
  city: 'COUNTYNAME', district: 'TOWNNAME', section: 'SECTNAME',
  parcel: 'LANDNO', area: 'AREA', manager: 'MANAGER'
});
```

目前無後端、既有系統登入或資料庫寫入。EDU_LAND 為網站內建測試資料，隨版本保存；使用介面額外匯入的檔案不會上傳，重新整理即還原內建測試地籍。公開底圖依來源規範及可用性提供；位置定位須 HTTPS 或 localhost。量測使用 Leaflet 球面距離，並非地籍測量成果。既有系統的地籍查詢流程參考使用者提供之操作手冊文字；本階段未複製其畫面，也未建立資料庫，後續資料庫設計須遵循指定 DB_Style_Guide_V2.5.md。

## 圖資與套件來源

- 國土測繪中心 WMTS：https://maps.nlsc.gov.tw/S09SOA/pro/Wmts_ajax_main.jsp
- WMTS URL：`https://wmts.nlsc.gov.tw/wmts/{圖層代碼}/default/GoogleMapsCompatible/{z}/{y}/{x}`，EMAP / PHOTO2 原生最高 19 級；更高層級放大現有圖磚。
- OSM：https://www.openstreetmap.org/copyright 與 https://operations.osmfoundation.org/policies/tiles/ ，正式大流量上線前須依 OSM 圖磚使用政策選擇適當服務。
- Leaflet：https://leafletjs.com/ （BSD-2-Clause）
- shpjs：https://github.com/calvinmetcalf/shapefile-js （MIT）
- fflate：https://github.com/101arrowz/fflate （MIT）

第三方原始授權檔保留於 `dist/vendor/`。參考手冊只作功能需求來源，未納入網站公開內容。
