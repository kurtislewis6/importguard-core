const IG=require("../src/index.js"),a=require("assert");
const s={columns:[{name:"d",type:"date",format:"DD/MM/YYYY",unique:true},{name:"e",type:"email",aliases:["E-mail"]}]};
const r=IG.validate("d,E-mail\n31/04/2026,a@b.co\n01/05/2026,x\n01/05/2026,c@d.co\n",s);
a.deepStrictEqual(r.errors.map(e=>e.row+":"+e.code),["2:TYPE_DATE","3:TYPE_EMAIL","4:DUPLICATE"]);
a.strictEqual(IG.decode(Buffer.from([0x63,0xE9])).encoding,"windows-1252");a.strictEqual(r.mapping[0].to,"e");a.strictEqual(IG.reportJSON(r),IG.reportJSON(IG.validate("d,E-mail\n31/04/2026,a@b.co\n01/05/2026,x\n01/05/2026,c@d.co\n",s)));
console.log("importguard-core tests: PASS");
