import {useState} from 'react'
import {cleanSlotValue,composeLibraryPrompt,defaultSlotValues,promptTemplates,type SlotValues} from './prompt-library'

export function PromptLibrary({busy,onPrompt}: {busy:boolean;onPrompt:(prompt:string)=>void}) {
 const [templateIndex,setTemplateIndex]=useState(0)
 const [saved,setSaved]=useState<Record<string,SlotValues>>({})
 const [openSlot,setOpenSlot]=useState<string|null>(null)
 const [custom,setCustom]=useState('')
 const [surpriseIndex,setSurpriseIndex]=useState(0)
 const template=promptTemplates[templateIndex]
 const values=saved[template.id]??defaultSlotValues(template)
 const update=(next:SlotValues)=>{
  setSaved(previous=>({...previous,[template.id]:next}))
  onPrompt(composeLibraryPrompt(template,next))
  setOpenSlot(null)
  setCustom('')
 }
 const selectTemplate=(index:number)=>{
  const next=promptTemplates[index]
  setTemplateIndex(index)
  setOpenSlot(null)
  onPrompt(composeLibraryPrompt(next,saved[next.id]??defaultSlotValues(next)))
 }
 const active=template.slots.find(slot=>slot.id===openSlot)
 return <div className="prompt-library" aria-label="Shape your curiosity">
  <div className="prompt-library-sentence" aria-label="Editable discovery sentence">
   {template.parts.map((part,index)=><span key={`${template.id}-${index}`}>{part}{index<template.slots.length&&<button type="button" className="prompt-library-slot" aria-label={`Change ${template.slots[index].label}: ${values[template.slots[index].id]}`} aria-expanded={openSlot===template.slots[index].id} disabled={busy} onClick={()=>{setOpenSlot(current=>current===template.slots[index].id?null:template.slots[index].id);setCustom('')}}>{values[template.slots[index].id]}<span aria-hidden="true">⌄</span></button>}</span>)}
  </div>
  <div className="prompt-library-actions">
   <button type="button" disabled={busy} onClick={()=>onPrompt(composeLibraryPrompt(template,values))}>Use this sentence</button>
   <button type="button" disabled={busy} onClick={()=>{const suggestion=template.surprise[surpriseIndex%template.surprise.length];setSurpriseIndex(current=>current+1);update({...values,[suggestion.slot]:suggestion.value})}}>Surprise me</button>
  </div>
  {active&&<div className="prompt-library-options" role="group" aria-label={`Choose ${active.label}`}>
   <div className="prompt-library-options-head"><span>{active.label}</span><button type="button" aria-label="Close keyword choices" onClick={()=>setOpenSlot(null)}>×</button></div>
   <div className="prompt-library-choices">{active.options.map(option=><button type="button" key={option} aria-pressed={values[active.id]===option} onClick={()=>update({...values,[active.id]:option})}>{option}</button>)}</div>
   <form onSubmit={event=>{event.preventDefault();const value=cleanSlotValue(custom);if(value)update({...values,[active.id]:value})}}><label htmlFor="custom-keyword">Your own words</label><input id="custom-keyword" maxLength={70} value={custom} onChange={event=>setCustom(event.target.value)} placeholder="Add a phrase…"/><button disabled={!cleanSlotValue(custom)} type="submit">Apply</button></form>
  </div>}
  <div className="prompt-library-tabs" role="group" aria-label="Discovery directions">{promptTemplates.map((item,index)=><button key={item.id} type="button" aria-pressed={index===templateIndex} disabled={busy} onClick={()=>selectTemplate(index)}>{item.name}</button>)}</div>
 </div>
}
