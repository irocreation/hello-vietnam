"""Render the vector monogram with 4x area antialiasing; no imaging dependencies."""
import struct,zlib
from pathlib import Path
SS=4
CREAM=(255,248,237);RED=(232,93,74);JADE=(61,139,117)
POLYGONS=[([(95,120),(150,120),(150,230),(215,230),(215,120),(270,120),(270,392),(215,392),(215,282),(150,282),(150,392),(95,392)],RED), ([(285,120),(343,120),(371,310),(399,120),(457,120),(402,392),(340,392)],JADE)]
def render(w,h,dest,logo_size=None):
 size=logo_size or w;left=(w-size)/2;top=(h-size)/2;sw=w*SS
 shapes=[([( (left+x*size/512)*SS,(top+y*size/512)*SS) for x,y in points],color) for points,color in POLYGONS]
 output=[]
 for y in range(h):
  subrows=[]
  for sy in range(SS):
   scan=(y*SS+sy+.5);row=bytearray(bytes(CREAM)*sw)
   for pts,col in shapes:
    xs=[]
    for i,(x1,y1) in enumerate(pts):
     x2,y2=pts[(i+1)%len(pts)]
     if (y1<=scan<y2) or (y2<=scan<y1):xs.append(x1+(scan-y1)*(x2-x1)/(y2-y1))
    xs.sort()
    for a,b in zip(xs[::2],xs[1::2]):
     start=max(0,int(a+.5));end=min(sw,int(b+.5));row[start*3:end*3]=bytes(col)*max(0,end-start)
   subrows.append(row)
  line=bytearray()
  for x in range(w):
   for c in range(3):line.append(round(sum(r[(x*SS+sx)*3+c] for r in subrows for sx in range(SS))/(SS*SS)))
  output.append(b'\0'+line)
 def chunk(kind,data):return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
 Path(dest).write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(output),9))+chunk(b'IEND',b''))
for n,name in [(192,'icon-192-v2.png'),(512,'icon-512-v2.png'),(180,'apple-touch-icon-v2.png')]:render(n,n,'public/'+name)
render(1200,630,'public/share-v2.png',620)
Path('public/icon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#FFF8ED"/>'+''.join('<polygon points="'+' '.join(f'{x},{y}' for x,y in pts)+'" fill="'+('#E85D4A' if color==RED else '#3D8B75')+'"/>' for pts,color in POLYGONS)+'</svg>')
