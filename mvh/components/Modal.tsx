
"use client";

export default function Modal({
  open, title, onClose, children
}:{
  open:boolean; title:string; onClose:()=>void; children:React.ReactNode
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal" onMouseDown={e=>e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        {children}
      </section>
    </div>
  );
}
