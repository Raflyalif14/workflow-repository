import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { runFacePassiveInference, runFaceLoginInference } from './run-face-login-inference';

function crc32(bytes: Buffer) {
  let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;}
  return (crc^0xffffffff)>>>0;
}
function chunk(type:string,data:Buffer){
  const name=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));
  return Buffer.concat([size,name,data,crc]);
}
function blank(gray:number){
  const header=Buffer.alloc(13);header.writeUInt32BE(640,0);header.writeUInt32BE(480,4);header[8]=8;header[9]=2;
  const pixels=Buffer.alloc((640*3+1)*480,gray);for(let y=0;y<480;y++)pixels[y*(640*3+1)]=0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
async function run(){
  const frames=[0,20,40].map(blank),template=Array.from({length:128},(_,i)=>i===0?1:0);
  await assert.rejects(runFacePassiveInference(frames,template,AbortSignal.timeout(20000)),/FACE_NONE/);
  await assert.rejects(runFaceLoginInference(frames,'left',template,AbortSignal.timeout(20000)),/FACE_NONE/);
  frames.forEach(f=>f.fill(0));template.fill(0);
  console.log('Real local runner PASS: passive-test and existing motion path both reject synthetic blank frames; binary framing, pinned Python/model startup and safe reason propagation exercised. No user photos.');
}
void run().catch(error=>{console.error(error);process.exitCode=1;});
