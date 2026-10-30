import sharp from 'sharp';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const dir='output/low-poly-blink-fix/';
const asset='src/assets/mascot/moth-low-poly-sheet.webp';
await fs.copyFile(asset,dir+'before-breathe-fix.webp');
const {data:before,info}=await sharp(asset).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const fixed=Buffer.from(before);
const pairs=[[40,28],[41,29],[42,30],[43,31]];
for(const [target,source] of pairs){
 for(let y=60;y<74;y++)for(let x=119;x<128;x++){
  const p=((Math.floor(target/6)*160+y)*info.width+target%6*160+x)*4;
  const q=((Math.floor(source/6)*160+y)*info.width+source%6*160+x)*4;
  // Reuse the repaired eyelid at its existing position; keep each frame's alpha.
  for(let c=0;c<3;c++)fixed[p+c]=before[q+c];
 }
}
await sharp(fixed,{raw:{width:info.width,height:info.height,channels:4}}).png().toFile(dir+'breathe-fixed.png');
execFileSync('python',['-c',"from PIL import Image; Image.open('output/low-poly-blink-fix/breathe-fixed.png').save('output/low-poly-blink-fix/breathe-fixed.webp',lossless=True,exact=True,method=6)"]);
const decoded=await sharp(dir+'breathe-fixed.webp').ensureAlpha().raw().toBuffer();
const counts={};
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
 const p=(y*info.width+x)*4;
 if(decoded[p+3]!==before[p+3])throw Error('Alpha changed');
 if(!decoded.subarray(p,p+4).equals(before.subarray(p,p+4))){
  const frame=Math.floor(y/160)*6+Math.floor(x/160);
  if(!pairs.some(([t])=>t===frame)||x%160<119||x%160>=128||y%160<60||y%160>=74)throw Error('Unrelated pixel changed');
  counts[frame]=(counts[frame]??0)+1;
 }
}
if(Object.keys(counts).length!==4)throw Error('Expected four corrected frames');
await fs.copyFile(dir+'breathe-fixed.webp',asset);
await fs.writeFile(dir+'breathe-validation.json',JSON.stringify({changedPixelsByFrame:counts,allOtherPixelsUnchanged:true,alphaUnchanged:true},null,2));
const layers=[];
for(let c=0;c<12;c++)layers.push({input:await sharp(asset).extract({left:c%6*160+76,top:Math.floor((36+c)/6)*160+42,width:56,height:45}).resize(224,180).png().toBuffer(),left:c%6*224,top:Math.floor(c/6)*180});
await sharp({create:{width:1344,height:360,channels:4,background:'#303030'}}).composite(layers).png().toFile(dir+'breathe-fixed-heads.png');
console.log(JSON.stringify({changedPixelsByFrame:counts,allOtherPixelsUnchanged:true,alphaUnchanged:true}));
