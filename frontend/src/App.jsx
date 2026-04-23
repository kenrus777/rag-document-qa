import{useState,useRef,useCallback}from'react';
const API='http://localhost:8000';
const C={green:'#00c896',red:'#ef4444',amber:'#fbbf24',blue:'#818cf8',bg:'#060810',bg2:'#0c0e1a',bg3:'#111428',border:'#1e2340',text:'#e2e8f0',muted:'#475569'};
const useFetch=(url,deps=[])=>{const[d,setD]=useState(null),[l,setL]=useState(false);const run=useCallback(async()=>{setL(true);try{const r=await fetch(url);setD(await r.json());}catch(e){}setL(false);},[url,...deps]);return{data:d,loading:l,run};};

function DocCard({doc,onDelete}){
  return<div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 12px',display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
    <span style={{fontSize:'1.2rem'}}>📄</span>
    <div style={{flex:1}}>
      <div style={{fontWeight:700,fontSize:'0.82rem'}}>{doc.file_name}</div>
      <div style={{fontSize:'0.62rem',color:C.muted}}>ID: {doc.doc_id?.slice(0,8)}...</div>
    </div>
    <button onClick={()=>onDelete(doc.doc_id)} style={{background:'transparent',border:`1px solid ${C.border}`,color:C.muted,padding:'3px 8px',borderRadius:5,cursor:'pointer',fontSize:'0.62rem'}}>Delete</button>
  </div>;
}

function SourceCitation({source,idx}){
  const[open,setOpen]=useState(false);
  return<div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:6,marginTop:6,overflow:'hidden'}}>
    <div onClick={()=>setOpen(!open)} style={{padding:'6px 10px',cursor:'pointer',display:'flex',alignItems:'center',gap:6,fontSize:'0.68rem'}}>
      <span style={{color:C.blue}}>📎 Source {idx+1}</span>
      <span style={{color:C.muted}}>{source.file_name} {source.page?`· p.${source.page}`:''}</span>
      <span style={{marginLeft:'auto',color:C.muted}}>{open?'▲':'▼'}</span>
    </div>
    {open&&<div style={{padding:'8px 10px',borderTop:`1px solid ${C.border}`,fontSize:'0.68rem',color:C.muted,lineHeight:1.6}}>{source.snippet}</div>}
  </div>;
}

export default function App(){
  const[docs,setDocs]=useState([]);
  const[messages,setMessages]=useState([{role:'assistant',content:'Hello! Upload a document and ask me anything about it. I\'ll answer with source citations.'}]);
  const[input,setInput]=useState('');
  const[uploading,setUploading]=useState(false);
  const[asking,setAsking]=useState(false);
  const[dragOver,setDragOver]=useState(false);
  const fileRef=useRef(null);
  const chatRef=useRef(null);

  const loadDocs=async()=>{
    const r=await fetch(`${API}/documents`);
    const d=await r.json();
    setDocs(d.documents||[]);
  };

  const uploadFile=async(file)=>{
    setUploading(true);
    const fd=new FormData();fd.append('file',file);
    try{
      const r=await fetch(`${API}/upload`,{method:'POST',body:fd});
      const d=await r.json();
      if(r.ok){
        setMessages(m=>[...m,{role:'assistant',content:`✅ Uploaded **${d.file_name}** — ${d.chunks} chunks created. Ask me anything about it!`}]);
        await loadDocs();
      }else{
        setMessages(m=>[...m,{role:'assistant',content:`❌ Upload failed: ${d.detail}`}]);
      }
    }catch(e){setMessages(m=>[...m,{role:'assistant',content:'❌ Upload error.'}]);}
    setUploading(false);
  };

  const deleteDoc=async(docId)=>{
    await fetch(`${API}/documents/${docId}`,{method:'DELETE'});
    setDocs(d=>d.filter(x=>x.doc_id!==docId));
    setMessages(m=>[...m,{role:'assistant',content:'Document removed from knowledge base.'}]);
  };

  const sendMessage=async()=>{
    if(!input.trim()||asking)return;
    const q=input.trim();setInput('');
    setMessages(m=>[...m,{role:'user',content:q}]);
    setAsking(true);
    try{
      const r=await fetch(`${API}/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q})});
      const d=await r.json();
      if(r.ok){setMessages(m=>[...m,{role:'assistant',content:d.answer,sources:d.sources,latency:d.latency_ms}]);}
      else{setMessages(m=>[...m,{role:'assistant',content:`❌ ${d.detail}`}]);}
    }catch(e){setMessages(m=>[...m,{role:'assistant',content:'❌ Request failed.'}]);}
    setAsking(false);
    setTimeout(()=>chatRef.current?.scrollTo(0,chatRef.current.scrollHeight),100);
  };

  return<div style={{background:C.bg,minHeight:'100vh',color:C.text,fontFamily:'Syne,sans-serif',display:'grid',gridTemplateColumns:'280px 1fr',height:'100vh'}}>
    {/* SIDEBAR */}
    <div style={{background:C.bg2,borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column'}}>
      <div style={{padding:'16px',borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontSize:'1rem',fontWeight:900,color:C.green,letterSpacing:3}}>RAG <span style={{color:C.muted}}>// Q&A</span></div>
        <div style={{fontSize:'0.6rem',color:C.muted,marginTop:4}}>Document Intelligence</div>
      </div>
      {/* Upload zone */}
      <div style={{padding:'12px'}}>
        <div onDrop={e=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files[0];if(f)uploadFile(f);}}
             onDragOver={e=>{e.preventDefault();setDragOver(true);}}
             onDragLeave={()=>setDragOver(false)}
             onClick={()=>fileRef.current?.click()}
             style={{border:`2px dashed ${dragOver?C.green:C.border}`,borderRadius:10,padding:'20px 12px',textAlign:'center',cursor:'pointer',transition:'all .2s',background:dragOver?'rgba(0,200,150,0.05)':'transparent'}}>
          <div style={{fontSize:'1.5rem',marginBottom:6}}>📁</div>
          <div style={{fontSize:'0.72rem',color:C.muted}}>{uploading?'Uploading...':'Drop PDF/DOCX/TXT'}</div>
          <div style={{fontSize:'0.6rem',color:C.muted,marginTop:4}}>or click to browse</div>
        </div>
        <input ref={fileRef} type='file' accept='.pdf,.docx,.doc,.txt' style={{display:'none'}} onChange={e=>{const f=e.target.files[0];if(f)uploadFile(f);e.target.value='';}}/>
      </div>
      {/* Document list */}
      <div style={{flex:1,padding:'0 12px',overflowY:'auto'}}>
        <div style={{fontSize:'0.58rem',color:C.muted,letterSpacing:2,textTransform:'uppercase',marginBottom:8}}>Documents ({docs.length})</div>
        {!docs.length&&<div style={{fontSize:'0.68rem',color:C.muted,textAlign:'center',marginTop:20}}>No documents yet.<br/>Upload one above.</div>}
        {docs.map(d=><DocCard key={d.doc_id} doc={d} onDelete={deleteDoc}/>)}
      </div>
      <div style={{padding:'12px',borderTop:`1px solid ${C.border}`,fontSize:'0.6rem',color:C.muted}}>
        <div>Embeddings: all-MiniLM-L6-v2</div>
        <div>VectorDB: ChromaDB</div>
        <div>LLM: Claude claude-sonnet-4-20250514</div>
      </div>
    </div>
    {/* CHAT */}
    <div style={{display:'flex',flexDirection:'column'}}>
      <div style={{background:C.bg2,borderBottom:`1px solid ${C.border}`,padding:'12px 20px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{fontWeight:700,fontSize:'0.9rem'}}>Document Q&A</div>
        <div style={{fontSize:'0.62rem',color:C.muted}}>Answers grounded in your documents · Source citations included</div>
      </div>
      {/* Messages */}
      <div ref={chatRef} style={{flex:1,overflowY:'auto',padding:'20px',display:'flex',flexDirection:'column',gap:12}}>
        {messages.map((m,i)=><div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
          <div style={{maxWidth:'75%'}}>
            <div style={{background:m.role==='user'?C.blue+'22':C.bg2,border:`1px solid ${m.role==='user'?C.blue:C.border}`,borderRadius:12,padding:'10px 14px',fontSize:'0.82rem',lineHeight:1.6}}>{m.content}</div>
            {m.sources?.length>0&&<div style={{marginTop:6}}>{m.sources.map((s,j)=><SourceCitation key={j} source={s} idx={j}/>)}</div>}
            {m.latency&&<div style={{fontSize:'0.58rem',color:C.muted,marginTop:4,textAlign:'right'}}>{m.latency}ms</div>}
          </div>
        </div>)}
        {asking&&<div style={{display:'flex',gap:6,alignItems:'center',color:C.muted,fontSize:'0.75rem'}}>
          <div style={{width:6,height:6,borderRadius:'50%',background:C.green,animation:'pulse 1s infinite'}}/>Thinking...
        </div>}
      </div>
      {/* Input */}
      <div style={{padding:'12px 16px',borderTop:`1px solid ${C.border}`,background:C.bg2,display:'flex',gap:10}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&sendMessage()} placeholder='Ask a question about your documents...' disabled={asking||!docs.length} style={{flex:1,background:C.bg3,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 14px',color:C.text,fontFamily:'Syne,sans-serif',fontSize:'0.85rem',outline:'none'}}/>
        <button onClick={sendMessage} disabled={asking||!input.trim()||!docs.length} style={{background:C.green,border:'none',color:C.bg,padding:'10px 20px',borderRadius:8,fontFamily:'Syne,sans-serif',fontWeight:800,cursor:'pointer',opacity:(!input.trim()||!docs.length)?0.4:1}}>Send</button>
      </div>
    </div>
  </div>;
}
