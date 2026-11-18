import { Composition } from 'remotion'
import { Tutorial, durationFor, type TutorialProps } from './Tutorial'
import { scripts } from './script'

export const Root = () => (
  <>
    {Object.keys(scripts).map((id) => (
      <Composition<any, TutorialProps>
        key={id}
        id={id}
        component={Tutorial}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={durationFor(id)}
        defaultProps={{ video: id, lang: 'es' }}
      />
    ))}
  </>
)
