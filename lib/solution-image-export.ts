import { toPng } from "html-to-image";

const paint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const loadImage = (src:string) => new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error("題目圖片無法載入，請重新開啟這筆紀錄後再試。"));image.src=src;});

export async function captureSolutionImage(root:HTMLElement,fileName:string,background="#ffffff"):Promise<File> {
    await document.fonts.ready;
    const images=Array.from(root.querySelectorAll("img"));
    const originals=images.map(image=>({src:image.src,opacity:image.style.opacity}));
    try {
      const decoded=await Promise.all(images.map(async image=>{
        const response=await fetch(image.src,{signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw new Error("題目圖片連結已失效，請重新開啟紀錄後再試。");
        const blob=await response.blob();
        const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("讀取圖片失敗。"));reader.readAsDataURL(blob);});
        image.src=data;return loadImage(data);
      }));
      await Promise.all(images.map(image=>image.decode()));
      await paint();
      const bounds=root.getBoundingClientRect();
      const imageBounds=images.map(image=>image.getBoundingClientRect());
      images.forEach(image=>{image.style.opacity="0";});
      const pixelRatio=Math.min(1.5,16000/Math.max(1,bounds.height));
      const png=await toPng(root,{backgroundColor:background,pixelRatio,cacheBust:false,skipAutoScale:true});
      const base=await loadImage(png);
      const canvas=document.createElement("canvas");canvas.width=base.naturalWidth;canvas.height=base.naturalHeight;
      const context=canvas.getContext("2d");if(!context)throw new Error("無法建立圖片。");
      context.drawImage(base,0,0);
      const scale=canvas.width/bounds.width;
      decoded.forEach((image,index)=>{const box=imageBounds[index];const ratio=Math.min(box.width/image.naturalWidth,box.height/image.naturalHeight);const width=image.naturalWidth*ratio,height=image.naturalHeight*ratio;context.drawImage(image,(box.left-bounds.left+(box.width-width)/2)*scale,(box.top-bounds.top+(box.height-height)/2)*scale,width*scale,height*scale);});
      const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/png"));
      if(!blob)throw new Error("圖片產生失敗，請再試一次。");
      return new File([blob],fileName,{type:"image/png"});
    } finally {images.forEach((image,index)=>{image.src=originals[index].src;image.style.opacity=originals[index].opacity;});}

}
