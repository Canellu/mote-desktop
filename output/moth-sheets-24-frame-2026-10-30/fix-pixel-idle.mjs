import sharp from 'sharp';
import fs from 'node:fs/promises';
const dir='output/moth-sheets-24-frame-2026-10-30/';
const original=dir+'02-pixel-art.png';
const source='C:/Users/Anton/.codex/generated_images/01a18cb9-293f-74d0-872a-58ad1298ce0f/exec-4fcd1d8a-bd64-4174-a368-70287d6a680c.png';
function anchor(data,w,h){let sx=0,sy=0,n=0;for(let y=h*.32|0;y<h*.53;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;const [r,g,b,a]=data.subarray(i,i+4);if(a>200&&r>170&&g>140&&b>90&&r>b*1.12&&g>b*1.07){sx+=x;sy+=y;n++;}}return {x:sx/n,y:sy/n};}
const {data,info}=await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const base=await sharp(original).extract({left:0,top:0,width:384,height:384}).ensureAlpha().raw().toBuffer();
// Match the stationary head, with one scale shared by all five replacement frames.
const getHead=(buf,w,h)=>{let sx=0,sy=0,n=0;for(let y=h*.25|0;y<h*.59;y++)for(let x=w*.3|0;x<w*.8;x++){const i=(y*w+x)*4;const [r,g,b,a]=buf.subarray(i,i+4);if(a>200&&r>170&&g>140&&b>90&&r>b*1.12&&g>b*1.07){sx+=x;sy+=y;n++;}}return{x:sx/n,y:sy/n};};
const target=getHead(base,384,384);
const scale=.428;
const layers=[];
for(let i=1;i<6;i++){
 const crop=await sharp(source).extract({left:i%3*512,top:Math.floor(i/3)*512,width:512,height:512}).ensureAlpha().raw().toBuffer();
 const a=getHead(crop,512,512);
 const size=Math.round(512*scale);
 const input=await sharp(crop,{raw:{width:512,height:512,channels:4}}).resize(size,size,{kernel:'nearest'}).png().toBuffer();
 layers.push({input,left:i*384+Math.round(target.x-a.x*scale),top:Math.round(target.y-a.y*scale)});
}
for(let y=0;y<384;y++)data.fill(0,(y*2304+384)*4,(y*2304+2304)*4);
const output=dir+'02-pixel-art-v2.png';
await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).composite(layers).png().toFile(output);
const fixed=await sharp(output).ensureAlpha().raw().toBuffer();
const originalRaw=await sharp(original).ensureAlpha().raw().toBuffer();
let untouched=true;
for(let y=0;y<1536;y++)for(let x=0;x<2304;x++)if(y>=384||x<384){const p=(y*2304+x)*4;for(let c=0;c<4;c++)if(fixed[p+c]!==originalRaw[p+c])untouched=false;}
if(!untouched)throw Error('Unrelated cells changed');
await sharp(output).extract({left:0,top:0,width:2304,height:384}).flatten({background:'#17171c'}).png().toFile(dir+'pixel-idle-fixed-preview.png');
await fs.writeFile(dir+'pixel-idle-fix-validation.json',JSON.stringify({width:2304,height:1536,grid:[6,4],cell:[384,384],frame1AndOtherRowsUnchanged:untouched},null,2));
console.log(output, 'frame 1 and rows 2–4 byte-identical:',untouched);
