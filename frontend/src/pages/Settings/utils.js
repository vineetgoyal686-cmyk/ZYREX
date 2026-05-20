export const inp = "w-full rounded-none border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-sm";
export const lbl = "text-[12px] font-bold text-slate-500 mb-1.5 ml-1 block";
export const btnPrimary = "flex items-center gap-2 rounded-none bg-linear-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-blue-200 hover:shadow-xl hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-50";
export const secHeader = "flex items-center gap-2 mb-5 border-l-4 border-blue-500 pl-4 py-1";
export const secTitle = "text-xs font-black uppercase tracking-[0.2em] text-slate-400";

export const resizeImage = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("File read failed"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Image load failed"));
      img.onload = () => {
        try {
          const maxSize = 800;
          const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
          const canvas = document.createElement("canvas");
          canvas.width  = Math.round(img.width  * ratio) || 1;
          canvas.height = Math.round(img.height * ratio) || 1;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.92));
        } catch (err) { reject(err); }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

export const resizeSignature = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("File read failed"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Image load failed"));
      img.onload = () => {
        try {
          const maxSize = 1200;
          const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
          const canvas = document.createElement("canvas");
          canvas.width  = Math.round(img.width  * ratio) || 1;
          canvas.height = Math.round(img.height * ratio) || 1;
          const ctx = canvas.getContext("2d");
          const isPng = file.type === "image/png";
          if (!isPng) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL(isPng ? "image/png" : "image/jpeg", 0.95));
        } catch (err) { reject(err); }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

