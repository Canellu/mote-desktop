import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const sources = JSON.parse(await fs.readFile(path.join(dir, 'sources.json'), 'utf8'));
const report = [];
for (const { name, source } of sources) {
  const im = sharp(source);
  const meta = await im.metadata();
  const cw = meta.width / 6, ch = meta.height / 4;
  const cells = [];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) {
    const buf = await sharp(source).extract({ left: col*cw, top: row*ch, width: cw, height: ch }).ensureAlpha().raw().toBuffer();
    // Exclude fragments of neighbouring sprites before packing each cell.
    const seen=new Uint8Array(cw*ch); let main=[];
    for(let p=0;p<cw*ch;p++) if(!seen[p] && buf[p*4+3]>32){
      const group=[p]; seen[p]=1;
      for(let j=0;j<group.length;j++){
        const q=group[j], x=q%cw, y=Math.floor(q/cw);
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          const nx=x+dx,ny=y+dy,np=ny*cw+nx;
          if(nx>=0&&nx<cw&&ny>=0&&ny<ch&&!seen[np]&&buf[np*4+3]>32){seen[np]=1;group.push(np);}
        }
      }
      if(group.length>main.length)main=group;
    }
    const keep=new Uint8Array(cw*ch);
    for(const p of main){const x=p%cw,y=Math.floor(p/cw);for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(x+dx>=0&&x+dx<cw&&y+dy>=0&&y+dy<ch)keep[(y+dy)*cw+x+dx]=1;}
    for(let p=0;p<cw*ch;p++)if(!keep[p])buf.fill(0,p*4,p*4+4);
    let left=cw, top=ch, right=0, bottom=0, sx=0, sy=0, n=0;
    for (let y=0;y<ch;y++) for (let x=0;x<cw;x++) {
      const i=(y*cw+x)*4, [r,g,b,a]=buf.subarray(i,i+4);
      if(a>127){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      // Locate the cream head for translation only; one uniform scale for all 24 cells.
      if(y>ch*.20 && y<ch*.55 && a>200 && r>170 && g>140 && b>90 && r>b*1.12 && g>b*1.07){sx+=x;sy+=y;n++;}
    }
    cells.push({buf,left,top,right,bottom,anchorX:n?sx/n:cw/2,anchorY:n?sy/n:ch*.4});
  }
  const base=cells[0];
  const scale=170/Math.max(...cells.slice(0,6).map(c=>c.right-c.left+1));
  const width=Math.round(cw*scale), height=Math.round(ch*scale);
  const targetX=192+(base.anchorX-(base.left+base.right)/2)*scale;
  const targetY=192+(base.anchorY-(base.top+base.bottom)/2)*scale;
  const layers=[];
  for(let i=0;i<24;i++){
    const c=cells[i];
    const input=await sharp(c.buf,{raw:{width:cw,height:ch,channels:4}}).resize(width,height,{kernel:name.includes('pixel')?'nearest':'lanczos3'}).png().toBuffer();
    layers.push({input,left:i%6*384+Math.round(targetX-c.anchorX*scale),top:Math.floor(i/6)*384+Math.round(targetY-c.anchorY*scale)});
  }
  const file=path.join(dir,`${name}.png`);
  await sharp({create:{width:2304,height:1536,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(layers).png().toFile(file);
  const {data,info}=await sharp(file).raw().toBuffer({resolveWithObject:true});
  let transparent=0;
  for(let i=3;i<data.length;i+=4)if(data[i]===0)transparent++;
  report.push({file:name+'.png',width:info.width,height:info.height,channels:info.channels,cells:24,cellSize:384,uniformScale:scale,transparentPixels:transparent});
}
await fs.writeFile(path.join(dir,'validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
