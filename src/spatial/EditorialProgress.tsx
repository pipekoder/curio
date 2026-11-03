import {stageTone,type ProgressSnapshot} from './editorial-progress'

// Glass editorial progress monitor: one row per observed workflow stage
// plus a live activity feed. Rows render only what the tracker derived
// from real backend responses; measured bars carry aria values while
// indeterminate bars carry none.
export default function EditorialProgress({progress}:{progress:ProgressSnapshot}){
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
    {progress.events.length>0&&<ul className="editorial-progress-feed" aria-label="Editorial activity">
      {progress.events.map(event=><li key={event.key}>{event.text}</li>)}
    </ul>}
    <p className="spatial-fine">{progress.done} of {progress.total} stages complete</p>
  </div>
}
