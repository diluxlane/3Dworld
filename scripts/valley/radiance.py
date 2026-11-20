"""Resample a verified Radiance RGBE panorama in linear light for Three.js IBL."""
import numpy as np

def read_hdr(path):
    with open(path,'rb') as src:
        while src.readline().strip(): pass
        y,height,x,width=src.readline().split()
        assert (y,x)==(b'-Y',b'+X')
        h,w=int(height),int(width)
        pixels=np.empty((h,w,4),dtype=np.uint8)
        for row in range(h):
            prefix=src.read(4)
            assert prefix[:2]==bytes([2,2]) and prefix[2]*256+prefix[3]==w
            for ch in range(4):
                pos=0
                while pos<w:
                    code=src.read(1)[0]
                    if code>128:
                        length=code-128
                        pixels[row,pos:pos+length,ch]=src.read(1)[0]
                    else:
                        length=code
                        pixels[row,pos:pos+length,ch]=np.frombuffer(src.read(length),dtype=np.uint8)
                    pos+=length
    return pixels[:,:,:3].astype(np.float32)*np.exp2(pixels[:,:,3:].astype(np.float32)-136.)

def reduce_panorama(source, destination, width, yaw_turns):
    pixels = read_hdr(source)
    h, w = pixels.shape[:2]
    height = width // 2
    small = pixels.reshape(height,h//height,width,w//width,3).mean(axis=(1,3))
    small = np.roll(small,round(yaw_turns*width),axis=1)
    brightest = np.max(small,axis=2)
    mantissa, exponent = np.frexp(brightest)
    scale = np.divide(256*mantissa,brightest,out=np.zeros_like(brightest),where=brightest>0)
    rgbe = np.empty((height,width,4),dtype=np.uint8)
    rgbe[:,:,:3] = np.minimum(255,small*scale[:,:,None]).astype(np.uint8)
    rgbe[:,:,3] = np.where(brightest>0,exponent+128,0)
    with open(destination,"wb") as dest:
        dest.write(f"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y {height} +X {width}\n".encode())
        for row in rgbe:
            dest.write(bytes([2,2,width>>8,width&255]))
            for ch in range(4):
                for off in range(0,width,128):
                    chunk=row[off:off+128,ch].tobytes()
                    dest.write(bytes([len(chunk)])+chunk)
