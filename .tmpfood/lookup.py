# 临时：食物库数值查证（2026-11-27）。跑完即删，不进 main。
import csv, io, json, re, sys, urllib.request, zipfile
UA={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"}
def get(u,t=180):
    with urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=t) as r: return r.read(), r.geturl()
PAT=[l.strip() for l in open(".tmpfood/patterns.txt",encoding="utf8") if l.strip() and not l.startswith("#")]
def fdc_zip(url,label):
    print("="*70); print("DATASET",label,url)
    try: raw,_=get(url,300)
    except Exception as e: print("  FAIL",e); return
    z=zipfile.ZipFile(io.BytesIO(raw)); names=z.namelist()
    def rd(suffix):
        n=[x for x in names if x.endswith("/"+suffix) or x==suffix]
        if not n: return []
        return list(csv.DictReader(io.TextIOWrapper(z.open(n[0]),encoding="utf8")))
    food={r["fdc_id"]:r["description"] for r in rd("food.csv")}
    want={"208":"kcal","203":"prot","204":"fat","205":"carb","1008":"kcal","1003":"prot","1004":"fat","1005":"carb","2047":"kcalAtw","2048":"kcalSpec"}
    nut={}
    for r in rd("food_nutrient.csv"):
        r["nutrient_id"]=r.get("nutrient_id","").strip()
        if r["nutrient_id"] in want: nut.setdefault(r["fdc_id"],{})[want[r["nutrient_id"]]]=r["amount"]
    mu={r["id"]:r["name"] for r in rd("measure_unit.csv")}
    por={}
    for r in rd("food_portion.csv"):
        por.setdefault(r["fdc_id"],[]).append(f'{r.get("amount","")} {mu.get(r.get("measure_unit_id",""),"")} {r.get("portion_description","")} {r.get("modifier","")} = {r.get("gram_weight","")} g'.replace("  "," "))
    print("  names",[n for n in names if n.endswith(".csv")][:30])
    fr=[r for r in rd("food_nutrient.csv")[:3]]; print("  fn sample",fr)
    ndb={r["fdc_id"]:r.get("NDB_number","") for r in rd("sr_legacy_food.csv")}
    print("  foods",len(food))
    for p in PAT:
        rx=re.compile(p,re.I); hits=[(k,v) for k,v in food.items() if rx.search(v)][:8]
        print(f"--- /{p}/ hits={len(hits)}")
        for k,v in hits:
            print(f"  {k} ndb={ndb.get(k,'')} | {v} | {json.dumps(nut.get(k,{}))} | portions: {' ; '.join(por.get(k,[])[:4])}")
fdc_zip("https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip","SR Legacy")
# 找 FNDDS（survey）下载连结
if 1:
    raw,_=get("https://fdc.nal.usda.gov/download-datasets")
    links=sorted(set(re.findall(rb'fdc-datasets/[A-Za-z0-9_\-\.]+\.zip',raw)))
    print("ZIP LINKS:",[l.decode() for l in links])
    sv=[l.decode() for l in links if b"survey" in l and b"csv" in l]
    if sv:
        PAT[:]= [l.strip() for l in open(".tmpfood/patterns_survey.txt",encoding="utf8") if l.strip()]
        fdc_zip("https://fdc.nal.usda.gov/"+sorted(sv)[-1],"FNDDS")
# 台湾食药署 食品营养成分资料库（开放资料 InfoId=20）
TW=["豆干","豆乾","饅頭","菜心","火龍果","粿條","米粉","米苔目","河粉","牛腱","羊肉","豬五花","五花","白茯苓","淮山","芡實","薏仁","蓮子(乾)","小米"]
TWX=["小米","白米","精白米","山藥","淮山","芡實","茯苓","薏仁","薏苡","蓮子","地瓜","甘藷","核桃","雞蛋","橄欖油","炒飯","粿條"]
for lt in ("3","2","1"):
    u=f"https://data.fda.gov.tw/opendata/exportDataList.do?method=ExportData&InfoId=20&logType={lt}"
    print("="*70); print("TW",u)
    try: raw,fu=get(u,300)
    except Exception as e: print("  FAIL",e); continue
    print("  bytes",len(raw),"final",fu,"head",raw[:80])
    data=None
    try:
        if raw[:2]==b"PK":
            z=zipfile.ZipFile(io.BytesIO(raw)); print("  zip",z.namelist()); raw=z.read(z.namelist()[0])
        txt=raw.decode("utf-8-sig","replace")
        data=json.loads(txt) if txt.lstrip()[:1] in "[{" else None
    except Exception as e: print("  parse FAIL",e)
    if not data: print("  not json; head:",raw[:300]); continue
    if isinstance(data,dict): data=next((v for v in data.values() if isinstance(v,list)),[])
    print("  type0",type(data[0]),str(data[0])[:600]); print("  type1",str(data[1])[:600])
    if isinstance(data[0],list):
        data=[{k:v for d in r for k,v in d.items()} for r in data]
    print("  rows",len(data),"keys",list(data[0].keys()))
    keyname=[k for k in data[0] if "樣品名稱" in k][0]
    item=[k for k in data[0] if k=="分析項"][0] if "分析項" in data[0] else None
    val=[k for k in data[0] if "每100" in k]; 
    names=sorted({r[keyname] for r in data})
    for t in TW:
        m=[n for n in names if t in n][:25]; print(f"--- {t}: {m}")
    show={"熱量","修正熱量","粗蛋白","粗脂肪","總碳水化合物","水分","膳食纖維"}
    for r in data:
        n=r[keyname]
        if any(t in n for t in TW) and (not item or r[item] in show):
            print("  ",json.dumps({k:r[k] for k in r if k in (keyname,"整合編號","俗名","樣品英文名稱","內容物描述","每單位重",item)+tuple(val)},ensure_ascii=False))
    break
print("DONE")
# run2
# run3
# run4
