export type PromptSlot = {id:string; label:string; options:readonly string[]}
export type PromptTemplate = {
 id:string; name:string; parts:readonly string[]; slots:readonly PromptSlot[];
 surprise:readonly {slot:string; value:string}[]
}

export const promptTemplates:readonly PromptTemplate[] = [
 {id:'new',name:'Something new',parts:['Introduce me to ',' in ',' with an emphasis on ','.'],slots:[
  {id:'subject',label:'subject',options:['emerging brands','independent ceramic studios','furniture designers','lighting studios']},
  {id:'place',label:'place',options:['Scandinavia','Copenhagen','Tokyo','Stockholm']},
  {id:'focus',label:'focus',options:['original design','craftsmanship','everyday rituals','material experiments']},
 ],surprise:[{slot:'focus',value:'unexpected connections to architecture'},{slot:'subject',value:'independent lighting studios'}]},
 {id:'language',name:'Design language',parts:['Show me ',' inspired by ', ', with a focus on ','.'],slots:[
  {id:'subject',label:'subject',options:['contemporary furniture','sculptural lighting','quiet interiors','modern ceramics']},
  {id:'inspiration',label:'inspiration',options:['Japanese aesthetics','Scandinavian spaces','organic forms','modern architecture']},
  {id:'focus',label:'focus',options:['natural materials','tactile surfaces','light and shadow','imperfect forms']},
 ],surprise:[{slot:'focus',value:'the rituals of everyday life'},{slot:'inspiration',value:'traditional craft'}]},
 {id:'people',name:'People & objects',parts:['Tell me the stories behind ',' from ',' who explore ','.'],slots:[
  {id:'subject',label:'subject',options:['independent makers','furniture designers','ceramic artists','jewelry makers']},
  {id:'place',label:'place',options:['Copenhagen','Stockholm','Tokyo','Paris']},
  {id:'focus',label:'focus',options:['traditional craftsmanship','new materials','quiet luxury','experimental forms']},
 ],surprise:[{slot:'focus',value:'connections between furniture and architecture'},{slot:'place',value:'Tokyo'}]},
 {id:'places',name:'Places & culture',parts:['Take me through ',' in ',' and explore ','.'],slots:[
  {id:'subject',label:'subject',options:['quiet coastal homes','modern city spaces','woodland retreats','calm reading rooms']},
  {id:'place',label:'place',options:['Northern Europe','Scandinavia','Japan','the French coast']},
  {id:'focus',label:'focus',options:['everyday rituals','light and space','material traditions','local culture']},
 ],surprise:[{slot:'focus',value:'unexpected links to fashion'},{slot:'subject',value:'lakeside retreats'}]},
 {id:'connections',name:'Connections',parts:['Connect ',' with ',' through ','.'],slots:[
  {id:'first',label:'first idea',options:['sculptural jewelry','ceramic forms','modern furniture','quiet fashion']},
  {id:'second',label:'second idea',options:['modern architecture','interior spaces','coastal places','traditional craft']},
  {id:'bridge',label:'connection',options:['shapes and materials','everyday rituals','light and shadow','unexpected textures']},
 ],surprise:[{slot:'bridge',value:'the geometry of ordinary objects'},{slot:'second',value:'Japanese tea rituals'}]},
]

export type SlotValues = Record<string,string>
export function defaultSlotValues(template:PromptTemplate):SlotValues {
 return Object.fromEntries(template.slots.map(slot=>[slot.id,slot.options[0]]))
}
export function cleanSlotValue(value:string):string {
 return [...value].map(char=>{const code=char.charCodeAt(0);return code<32||code===127?' ':char}).join('').replace(/\s+/g,' ').trim().slice(0,70)
}
export function composeLibraryPrompt(template:PromptTemplate,values:SlotValues):string {
 return template.parts.map((part,index)=>part+(index<template.slots.length ? cleanSlotValue(values[template.slots[index].id]??'') : '')).join('')
}
