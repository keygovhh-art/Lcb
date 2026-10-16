/** Exact daytime Gregorian <-> Hebrew calendar conversions from ICU/Intl.
 * Date is stored as the SAME Gregorian ISO date in existing APIs. No timezone
 * shifts, no alternate database date, no Hebrew/Gregorian mismatch.
 */
const fmt=new Intl.DateTimeFormat('en-US-u-ca-hebrew',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'});
const re=/^(\d{4})-(\d{2})-(\d{2})$/;
const names={
 'Tishri':'תשרי','Tishrei':'תשרי','Heshvan':'חשון','Cheshvan':'חשון',
 'Kislev':'כסלו','Tevet':'טבת','Shevat':'שבט','Shvat':'שבט',
 'Adar':'אדר','Adar I':'אדר א׳','Adar II':'אדר ב׳',
 'Nisan':'ניסן','Iyar':'אייר','Sivan':'סיון',
 'Tamuz':'תמוז','Tammuz':'תמוז','Av':'אב','Elul':'אלול'
};
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const parshaNames=['בא','בשלח','יתרו','משפטים','תרומה','תצוה','כי תשא','ויקהל','פקודי','ויקרא','צו','שמיני','תזריע','מצורע','','אחרי מות','קדושים','אמור','בהר','בחוקותי','במדבר','נשא','בהעלותך','שלח','קרח','חקת','בלק','פינחס','מטות, מסעי','דברים','ואתחנן','עקב','ראה','שופטים','כי תצא','כי תבא','נצבים','וילך','האזינו','בראשית','נח','לך לך','וירא','חיי שרה','תולדות','ויצא','וישלח','וישב','מקץ','ויגש','מטות','מסעי','ויחי','שמות','וארא','ויקהל, פקודי','תזריע, מצורע','אחרי מות, קדושים','בהר, בחוקותי','חקת, בלק','נצבים, וילך'];
// Generated from pyluach's diaspora and Israel annual sedra tables for
// Gregorian 1900–2100 (inclusive); bundled locally, no API dependency.
const parshaCompressed={
 diaspora:'eNqlmsmWFDcQRfd8Sy6k0BhLG2OgGQpjYzA7wMYDk+cu8/V+aqBPVUnqjHx8wD0ZFfkiQ7rdXp1b8vLFl9e/uvH1zVu3z+7cvXd/t3vwzcNvv3v0/eMnPzx99vzFjz+9/PmXX3979frN7u273//486+///n3fH/Nq/NLWpyXj3g4u7O7G9PD/GjX0HJJ1t2b3SHqGitLXC7RT08ePrge0Y0NS1j27oj++OT1muMiVM2+wWkpy7jmq/HGZjR6P3rylT/3Q7MKGn1Emn7uh5orGs3WrGgWWbN3i+9e8IPd4Qv+7/2w7gZ7NHpPvKbGChpN1Nya5UPfrEnNXSp9PE6l+TU1Nk1Saak5o9FMzRcPLl2zbNFqbD1NpX2SvE5TefVPBisOjSZrFj9IpemD12DhUynBlsrRCEtEo9maU59Kc82ZT6UUcyr7cZCKRpOLRfQwlRs+eGCDQyrP99tfU2N9l0pzzUHQaE9+pEOYpXL9Ix0iUkkulpAGqbTWnNFotuZy2KyNNdc+lebjTtBJKg3jENsxi1ws0ffNsqYyCp/KGOapXDuiRRzuqJovHpxOU2lfLDFPU7m6WGJBo9maKxrNLJbGKpp1Tn6kk7OlcjQOyfeptC6WJGg0W3OYpNIwSakd4MljZUp9Ks3jkDIaTdQsjW0HePKIliqfyqSjVNqWYXZo9Dn5kc7+tFn2VGYZpNK4WHKYpdJQczy8km6sOfWptE5SzrNUGsYhl/5Kal0sufZXUutiydql0jxJxc1TubZYiu+vpNaaC9YZffcvYZrK1cVS4pEoMfuKi2al01RuqDmj0eQklWJM5WgcSh2IEuM4FJ2JkvXFUt3ESBkmqfq+WdbFUmUmSgw1h0kqLYulRjSaXCw1dc0yp7Lmub5bWyy1oNHMYmls7a6k9lRW5fWdOl7fqef1ncpAlBgnSQOv7zSeihJjzS2VmrpUmm9ZmieixLBYtPBSWSuv71RJqXxNnBt5UlsqAXtjKrsRBiusvgMbWKkMNs6M1FoqwSZaKgPOrL4DW1ipDLb2V1JzzcrqO3HesfoOrKelMmDprqTmVPowTuX6MgTbDvBszYmVymDzSJSYPtKAC6vvwFZW34FVViqLEzfTd+upFG9L5ahmEVrfAQ6sVAZ75Em3LBaw6bhZ9r9Wgs2svgNbSKnc2Do1UuupFOVTGRwrlcF6ViqDlcMr6caawyCVlprbGw6RlcpgEyuVweZelFhTGQqr78BWs77ra1ZaKouLbqzvLMed6FmpDFZYfQc2sFIZbKT1HeB02KwNp//GZlYqgy2sVAZbJ0bKUrOy+k5ccrRUBuxZqQxWun/dMf6FFWxg9R3YkEplsIlMZWNzJ0rsbzgVViqDraxUBqusVBaXHavvwHpaKgMWViqDDaxUBhtZfQc2mfVdX3NmpTLYQktlwHVqpFbHISur78QVx0plsH6aytWaixwd/rctlhJYqQw2slIZbLKlclhzZvUd2MJKZbCVlsqA1SqV+3GojtV3YD0rlcEKK5XBBlIqNzZ+hr6riZXKYDMrlcEWXt/Vyuu7qofN2lBzS6U6ViqD9by+UzHru26xaGClMtjIS2VN81SujoNmXt9p4aWyVj6VqsZU9jV750h99z9YESUa',
 israel:'eNqlmkmWHEUQRPc6Sy48PEZfMoMkKCHEuGMexQxdcHosGqFX1eGl9DIO8F+avCzSI38rmcjWtpdefuXV115/48237j94+PY7h0fvPn7vyfsffPjRx598+tlff3/x5Vdff/Ptd9//8PTw408///Lrb7//8efN8V4ySVvdJOkzPN9/cHhY6uP2H/r5M3Icnh5OUZmsbmV7jrpPfo6f0ZPNW96Ockb7T3Yyl02pzGnCdetbLPNhCd0w6GPkyc6wOga9kOtT7/xz/808MGg2s2FYZOYkW1p+4EeHQLUmnDDoI/EzTVYxaCLzHFbK67AuZF5amcp5K8M/02RrsJVe5oZBM5lvH9zdYe1Xa7LDa2XsJCULt3LJrIJBk5k1Oa0MvfAmrHwrNcda6R1hLRg0m7n6rQxlbnwrtYdbuR4HHRg0uVjUTlt5xQsPbBa08uZ4/c802eS2MpQ5KwadyJd0ztFWOg8uaCW5WHLda+ULMjcMms3cT4d1ZeaxtjJ83ckWbKVzHMq8ZpGLpSR/WJHFUpRvZcnxVi6ZcbmjMt8+uHqtjC2W0sKtXN53pWPQbOaBQTOLZbKGYd2QL+kqsVZ6x6GmtZXRxVIVg2Yz52ArnR+4zgs8ea2s1W9l6DjUhkETmXWy8wJPXtHq4FtZbbeVF5dhEwz6hnxJt+QNK/aSbrrXysuLpeVoK53M5fST9MrMdW1l9CS1Fm2lcxxaXz9Jo4ulDf+TNLJYmrmtDJ2kLvFW3s3ck/9JGsncsc7ob/+ew61cjnAvZ6Ik7Ctuh1W9VgYzNwyaPEm9B1vpHYc+9kTJ5ePQLSpK1sUyJGiknGGNtA4ruliGRkWJkzkHW+ktllEwaHKxjOoOK7RYRovru7uLZXQMmlkskx3uJ2nsJT2M13cmvL6zxOs70z1RcrmVlnl9Z+WuKAme/tlKq0srw19Z1oL6zlks1nmpbIPXd2akVL6nIrJrpC61EnAKtnI5wmCV1XdgMyuVwZaokXKGVWmpDLix+g5sZ6Uy2LF+koYzG6vvVJKw+g5soqUyYHU/SQOLBWyOtXJdhmDnBZ7NXFmpDLbtipLLv3DqrL4DO1h9B9ZYqayiEtV3ays1xVrpZVal9R3gzEplsGee9JrFAraeDyv+10qwjdV3YDsplSc7wkbKebDxrczCSmWwiZXKYPX0k/TKzHmvlS84DrmwUhlsZaUy2OaLkv3rDtjO6juwI6zv1sxGS2WVIjF95113SmKlMlhl9R3YzEplsIXWd4Dr6bCuuP1PtrFSGWxnpTLYETNSbmZj9Z1KFVoqA06sVAary3/dCf6FFWxm9R3YwkplsJVs5WSbK0piL+naWakMdrBSGayxUlmlCavvwCZaKgNWViqDzaxUBltYfQe2hvXdmrmxUhlsp6Uy4BE2UstxaMbqO5UurFQGm8KtXDJ3Pbv8X7dYemalMtjCSmWwNdZKN3Nj9R3YzkplsIOWyoAtKpXX4zCE1XdgEyuVwSorlcFmUipPtvwPfTcqK5XBNlYqg+28vhuD13fDTod1RebZShNWKoNNvL4zDeu7ZbFYZqUy2MJLZavxVi7HwRqv76zzUtkG30qLetI1cxIh9d0/ikc7LQ=='
};
export function asGregorianDate(iso:string):Date|null {
 const match=re.exec(iso);if(!match)return null;
 const y=Number(match[1]),m=Number(match[2]),d=Number(match[3]);
 const dt=new Date(Date.UTC(y,m-1,d,12));
 return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?dt:null;
}
export function isoUTC(date:Date):string{
 return [date.getUTCFullYear(),String(date.getUTCMonth()+1).padStart(2,'0'),String(date.getUTCDate()).padStart(2,'0')].join('-');
}
export function hebrewParts(iso:string){
 const date=asGregorianDate(iso);if(!date)return null;
 const parts=Object.fromEntries(fmt.formatToParts(date).map(p=>[p.type,p.value]));
 return {day:Number(parts.day),month:parts.month,year:Number(parts.year)};
}
const letters:[number,string][]=[[400,'ת'],[300,'ש'],[200,'ר'],[100,'ק'],[90,'צ'],[80,'פ'],[70,'ע'],[60,'ס'],[50,'נ'],[40,'מ'],[30,'ל'],[20,'כ'],[10,'י'],[9,'ט'],[8,'ח'],[7,'ז'],[6,'ו'],[5,'ה'],[4,'ד'],[3,'ג'],[2,'ב'],[1,'א']];
export function hebrewNumerals(num:number):string{
 let n=num%1000;if(n===15)return 'ט״ו';if(n===16)return 'ט״ז';
 let out='';for(const [value,letter] of letters){while(n>=value){out+=letter;n-=value;}}
 return out.length===1?out+'׳':out.slice(0,-1)+'״'+out.slice(-1);
}
export function jewishDateLabel(iso:string){
 const v=hebrewParts(iso);if(!v)return '';
 return hebrewNumerals(v.day)+' '+(names[v.month]||v.month)+' '+hebrewNumerals(v.year);
}
export function hebrewYearDays(year:number){
 if(!Number.isInteger(year)||year<5660||year>5860)return [];
 const from=Date.UTC(year-3761,7,1,12),until=Date.UTC(year-3760,10,1,12);
 const months:Array<{id:string;label:string;days:Array<{iso:string;day:number;weekday:number;gregDay:number}>}>=[];
 const byId=new Map<string,typeof months[number]>();
 for(let time=from;time<until;time+=86400000){
  const date=new Date(time),iso=isoUTC(date),h=hebrewParts(iso);
  if(!h||h.year!==year)continue;
  let group=byId.get(h.month);
  if(!group){group={id:h.month,label:names[h.month]||h.month,days:[]};months.push(group);byId.set(h.month,group);}
  group.days.push({iso,day:h.day,weekday:date.getUTCDay(),gregDay:date.getUTCDate()});
 }
 return months;
}
const cache:Record<string,Promise<Map<number,{first:number;codes:string}>>>={};
async function sedra(year:number,location:'diaspora'|'israel'){
 if(cache[location])return cache[location];
 cache[location]=(async()=>{
  const bytes=Uint8Array.from(atob(parshaCompressed[location]),c=>c.charCodeAt(0));
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  const data=await new Response(stream).text();
  const result=new Map<number,{first:number;codes:string}>();
  for(const line of data.trim().split('\n')){
   const [y,first,codes]=line.split(',');result.set(Number(y),{first:Number(first),codes});
  }
  return result;
 })();
 return cache[location];
}
export async function upcomingParsha(iso:string,location:'diaspora'|'israel'='diaspora'):Promise<string>{
 const d=asGregorianDate(iso);if(!d)return '';
 d.setUTCDate(d.getUTCDate()+(6-d.getUTCDay()+7)%7);
 const year=d.getUTCFullYear();
 if(year<1900||year>2100)return 'פרשה־לוח פאר דעם יאר איז נישט פאראן';
 try{
  const table=await sedra(year,location),entry=table.get(year);if(!entry)return '';
  const first=Date.UTC(year,0,entry.first,12);
  const i=Math.floor((d.getTime()-first)/604800000);
  const name=parshaNames[alphabet.indexOf(entry.codes[i]||'')];
  return name ? 'פ׳ '+name : 'שבת יום־טוב / קיין געווענליכע פרשה';
 }catch{return 'פרשה־לוח נישט אוועילעבל';}
}
