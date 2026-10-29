/** Reader-only interaction state. The edition and collection remain owned by EditorialExperience. */
export type ReaderInteraction = { featureIndex: number; exploring: boolean; detailOpen: boolean }
export type ReaderAction =
  | { type: 'toggleExplore' }
  | { type: 'toggleDetail' }
  | { type: 'closeDetail' }
  | { type: 'changeFeature'; index: number }

export const initialReaderInteraction: ReaderInteraction = { featureIndex: 0, exploring: false, detailOpen: false }

export function readerInteraction(state: ReaderInteraction, action: ReaderAction): ReaderInteraction {
  switch (action.type) {
    case 'toggleExplore': return { ...state, exploring: !state.exploring, detailOpen: false }
    case 'toggleDetail': return state.exploring ? { ...state, detailOpen: !state.detailOpen } : state
    case 'closeDetail': return { ...state, detailOpen: false }
    case 'changeFeature': return { featureIndex: action.index, exploring: false, detailOpen: false }
  }
}
