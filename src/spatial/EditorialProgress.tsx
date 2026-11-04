import {useEffect,useRef} from 'react'
import type {ModelCallEvent} from '../../shared/article-model-calls'
import {stageTone,type ProgressSnapshot} from './editorial-progress'

// Glass editorial progress monitor: one row per observed workflow stage
// plus a live activity feed. Rows render only what the tracker derived
// from real backend responses; measured bars carry aria values while
// indeterminate bars carry none.
const MODEL_CALL_TASK:Record<ModelCallEvent['stage'],string>={planning:'Planning',chief_editor:'Chief Editor',reviewer:'Reviewer',revision:'Revision',confirmation:'Confirmation'}
const MODEL_CALL_STATUS:Record<ModelCallEvent['status'],string>={calling:'Calling',completed:'Completed',failed:'Failed'}
// A calling entry has no result yet, so the log names the real stage that
// is executing. Completed and failed entries always carry the backend's
// own summary of the actual invocation.
const MODEL_CALL_RUNNING:Record<ModelCallEvent['stage'],string>={planning:'Planning the editorial angle.',chief_editor:'Composing the editorial narrative.',reviewer:'Reviewing the draft against the evidence.',revision:'Revising the article using reviewer feedback.',confirmation:'Confirming the final assessment.'}
const formatCallTime=(at:number)=>new Date(at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'})
const formatCallDuration=(call:ModelCallEvent)=>`${(((call.endedAt??Date.now())-call.startedAt)/1000).toFixed(1)}s`

export default function EditorialProgress({progress}:{progress:ProgressSnapshot}){
  const logRef=useRef<HTMLOListElement|null>(null)
  useEffect(()=>{const list=logRef.current;if(list)list.scrollTop=list.scrollHeight},[progress.modelCalls.length])
  return <div className="editorial-progress">
    <ol className="editorial-progress-rows">
      {progress.stages.map(stage=>{
        const tone=stageTone(stage)
        return <li key={stage.id} className="editorial-progress-row">
          <div className="editorial-progress-head">
            <span className="editorial-progress-label">{stage.label}</span>
            <span className={`editorial-progress-pill is-${tone}`}>{stage.status}</span>
          </div>
          <div className={`editorial-progress-bar is-${tone}`} role="progressbar"
            aria-label={`${stage.label} progress`} aria-valuemin={0} aria-valuemax={100}
            {...(stage.fraction===null?{}:{'aria-valuenow':Math.round(stage.fraction*100)})}>
            <span className="editorial-progress-fill" style={stage.fraction===null?undefined:{width:`${Math.round(stage.fraction*100)}%`}} aria-hidden="true"/>
          </div>
          {stage.meta&&<p className="spatial-fine">{stage.meta}</p>}
        </li>
      })}
    </ol>
    {progress.modelCalls.length>0&&<section className="editorial-model-log" aria-label="Live Meta AI logs">
      <p className="spatial-eyebrow">Live Meta AI Logs</p>
      <ol className="editorial-model-log-list" ref={logRef}>
        {progress.modelCalls.map(call=><li key={call.id} className="editorial-model-log-row">
          <div className="editorial-model-log-line">{formatCallTime(call.startedAt)} · {call.model} · {MODEL_CALL_STATUS[call.status]} · {formatCallDuration(call)}{call.attempt>1?` · attempt ${call.attempt}`:''}</div>
          <div className="editorial-model-log-task">{MODEL_CALL_TASK[call.stage]} — {call.summary??MODEL_CALL_RUNNING[call.stage]}</div>
        </li>)}
      </ol>
    </section>}
    {progress.events.length>0&&<ul className="editorial-progress-feed" aria-label="Editorial activity">
      {progress.events.map(event=><li key={event.key}>{event.text}</li>)}
    </ul>}
    <p className="spatial-fine">{progress.done} of {progress.total} stages complete</p>
  </div>
}
