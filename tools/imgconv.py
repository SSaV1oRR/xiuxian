import sys
from PIL import Image
src,dst,size,q=sys.argv[1],sys.argv[2],int(sys.argv[3]),int(sys.argv[4])
im=Image.open(src)
mode='RGB'
im=im.convert(mode)
if max(im.size)>size: im=im.resize((size,size),Image.LANCZOS)
im.save(dst,'JPEG',quality=q,optimize=True,progressive=False)
