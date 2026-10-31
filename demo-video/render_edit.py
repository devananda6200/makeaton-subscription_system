"""Run the supplied renderer in bounded parallel jobs, then export 4K/60 with audio."""
from pathlib import Path
import concurrent.futures, json, os, subprocess, sys, time
ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'tmp/demo-edit'
ffmpeg=os.environ.get('BRIGHTLOOP_FFMPEG','ffmpeg'); probe=str(Path(ffmpeg).with_name('ffprobe.exe')) if ffmpeg.endswith('.exe') else 'ffprobe'
os.environ['PATH']=str(Path(ffmpeg).parent)+os.pathsep+os.environ['PATH']
meta=json.loads((WORK/'metadata.json').read_text());out=Path(meta['output'])
def job(cp):
 index=Path(cp).stem;dest=WORK/(index+'.mp4');log=WORK/(index+'.log')
 if dest.exists() and dest.stat().st_size>10000:return index+' cached'
 with log.open('w') as f:
  subprocess.run([sys.executable,str(ROOT/'demo-video/render_browser_demo.py'),'--config',cp,'--output',str(dest)],stdout=f,stderr=f,check=True)
 return index+' rendered'
start=time.monotonic();jobs=json.loads((WORK/'jobs.json').read_text())
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for done in concurrent.futures.as_completed([pool.submit(job,p) for p in jobs]):
  print(done.result(),f'elapsed={time.monotonic()-start:.0f}s',flush=True)
concat=WORK/'concat.txt';concat.write_text('\n'.join("file '"+str(WORK/(Path(cp).stem+'.mp4')).replace('\\','/')+"'" for cp in jobs))
master=out/'Brightloop-Product-Demo-4K60.mp4'
cmd=[ffmpeg,'-y','-f','concat','-safe','0','-i',str(concat),'-i',str(WORK/'score.wav'),'-vf','scale=3840:2880:flags=lanczos,setsar=1,fade=t=in:st=0:d=0.65,fade=t=out:st='+str(meta['duration']-1)+':d=1','-c:v','h264_nvenc','-preset','p5','-rc','vbr','-cq','20','-b:v','0','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-shortest','-movflags','+faststart',str(master)]
with (WORK/'export.log').open('w') as f:subprocess.run(cmd,stdout=f,stderr=f,check=True)
small=out/'Brightloop-Product-Demo-Upload.mp4'
with (WORK/'upload.log').open('w') as f:subprocess.run([ffmpeg,'-y','-i',str(master),'-vf','scale=1920:1440:flags=lanczos','-c:v','h264_nvenc','-preset','p5','-cq','23','-b:v','0','-c:a','copy','-movflags','+faststart',str(small)],stdout=f,stderr=f,check=True)
for video in [master,small]:
 result=subprocess.check_output([probe,'-v','error','-show_entries','stream=codec_name,width,height,r_frame_rate:format=duration,size','-of','json',str(video)],text=True);(out/(video.stem+'-verification.json')).write_text(result);print(video,result,flush=True)
subprocess.run([ffmpeg,'-y','-ss','110','-i',str(master),'-frames:v','1','-update','1',str(out/'Brightloop-preview.png')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
print('DONE',flush=True)
