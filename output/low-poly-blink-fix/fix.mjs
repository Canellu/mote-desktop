import sharp from 'sharp';
import fs from 'node:fs/promises';
const dir='output/low-poly-blink-fix/';
const asset='src/assets/mascot/moth-low-poly-sheet.webp';
const {data:before,info}=await sharp(dir+'before.webp').ensureAlpha().raw().toBuffer({resolveWithObject:true});
const fixed=Buffer.from(before);
const changedFrames=[];
for(let pose=1;pose<6;pose++){
 const patch=await sharp(dir+'generated-normalized.png').extract({left:pose*224+172,top:72,width:36,height:56}).resize(9,14).ensureAlpha().raw().toBuffer();
 for(const index of [24+pose,35-pose]){
  changedFrames.push(index);
  const left=index%6*160+119, top=Math.floor(index/6)*160+60;
  for(let y=0;y<14;y++)for(let x=0;x<9;x++){
   const p=((top+y)*info.width+left+x)*4, q=(y*9+x)*4;
   const blend=Math.min(1,x/1.5,(8-x)/1.5,y/1.5,(13-y)/1.5);
   if(before[p+3]===0)continue;
   for(let c=0;c<3;c++)fixed[p+c]=Math.round(before[p+c]*(1-blend)+patch[q+c]*blend);
  }
 }
}
await sharp(fixed,{raw:{width:info.width,height:info.height,channels:4}}).png().toFile(dir+'fixed.png');
const {execFileSync}=await import('node:child_process');
execFileSync('python',['-c',"from PIL import Image; Image.open('output/low-poly-blink-fix/fixed.png').save('output/low-poly-blink-fix/fixed.webp',lossless=True,exact=True,method=6)"]);
const decoded=await sharp(dir+'fixed.webp').ensureAlpha().raw().toBuffer();
let changedPixels=0;
const frameCounts={};
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
 const p=(y*info.width+x)*4;
 if(decoded[p+3]!==before[p+3])throw Error('Alpha changed');
 if(!decoded.subarray(p,p+4).equals(before.subarray(p,p+4))){
  const frame=Math.floor(y/160)*6+Math.floor(x/160);
  if(!changedFrames.includes(frame)||x%160<119||x%160>=128||y%160<60||y%160>=74)throw Error('Unrelated pixel changed');
  changedPixels++; frameCounts[frame]=(frameCounts[frame]??0)+1;
 }
}
if(Object.keys(frameCounts).length!==10)throw Error('Expected ten corrected forward/reverse frames');
await fs.writeFile(dir+'validation.json',JSON.stringify({changedPixels,frameCounts,allOtherPixelsUnchanged:true,alphaUnchanged:true},null,2));
await fs.copyFile(dir+'fixed.webp',asset);
const layers=[];
for(let c=0;c<6;c++)layers.push({input:await sharp(asset).extract({left:c*160+76,top:682,width:56,height:45}).resize(224,180).png().toBuffer(),left:c*224,top:0});
await sharp({create:{width:1344,height:180,channels:4,background:'#303030'}}).composite(layers).png().toFile(dir+'fixed-heads.png');
console.log(JSON.stringify({changedPixels,frameCounts,allOtherPixelsUnchanged:true,alphaUnchanged:true}));
