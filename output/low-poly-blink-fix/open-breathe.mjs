import sharp from 'sharp';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const dir='output/low-poly-blink-fix/';
const asset='src/assets/mascot/moth-low-poly-sheet.webp';
await fs.copyFile(asset,dir+'before-open-breathe.webp');
const {data:before,info}=await sharp(dir+'before-open-breathe.webp').ensureAlpha().raw().toBuffer({resolveWithObject:true});
const fixed=Buffer.from(before);
const targets=[40,41,42,43];
const regions=[{x:93,y:51,w:18,h:21},{x:119,y:60,w:9,h:14}];
for(const target of targets)for(const r of regions){
 for(let y=0;y<r.h;y++)for(let x=0;x<r.w;x++){
  const p=((Math.floor(target/6)*160+r.y+y)*info.width+target%6*160+r.x+x)*4;
  const q=((Math.floor(39/6)*160+r.y+y)*info.width+39%6*160+r.x+x)*4;
  const blend=Math.min(1,x/1.5,(r.w-1-x)/1.5,y/1.5,(r.h-1-y)/1.5);
  for(let c=0;c<3;c++)fixed[p+c]=Math.round(before[p+c]*(1-blend)+before[q+c]*blend);
 }
}
await sharp(fixed,{raw:{width:info.width,height:info.height,channels:4}}).png().toFile(dir+'open-breathe.png');
execFileSync('python',['-c',"from PIL import Image; Image.open('output/low-poly-blink-fix/open-breathe.png').save('output/low-poly-blink-fix/open-breathe.webp',lossless=True,exact=True,method=6)"]);
const decoded=await sharp(dir+'open-breathe.webp').ensureAlpha().raw().toBuffer();
const counts={};
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
 const p=(y*info.width+x)*4;
 if(decoded[p+3]!==before[p+3])throw Error('Alpha changed');
 if(!decoded.subarray(p,p+4).equals(before.subarray(p,p+4))){
  const frame=Math.floor(y/160)*6+Math.floor(x/160);
  if(!targets.includes(frame)||!regions.some(r=>x%160>=r.x&&x%160<r.x+r.w&&y%160>=r.y&&y%160<r.y+r.h))throw Error('Unrelated pixel changed');
  counts[frame]=(counts[frame]??0)+1;
 }
}
await fs.writeFile(dir+'open-breathe-validation.json',JSON.stringify({changedPixelsByFrame:counts,allOtherPixelsUnchanged:true,alphaUnchanged:true},null,2));
const layers=[];
for(let c=0;c<12;c++)layers.push({input:await sharp(dir+'open-breathe.webp').extract({left:c%6*160+76,top:Math.floor((36+c)/6)*160+42,width:56,height:45}).resize(224,180).png().toBuffer(),left:c%6*224,top:Math.floor(c/6)*180});
await sharp({create:{width:1344,height:360,channels:4,background:'#303030'}}).composite(layers).png().toFile(dir+'open-breathe-heads.png');
console.log(JSON.stringify({changedPixelsByFrame:counts,allOtherPixelsUnchanged:true,alphaUnchanged:true}));
