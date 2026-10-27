import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,render,screen} from '@testing-library/react'
import App from '../src/App'
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('presents one primary editorial journey without competing legacy generators',()=>{
 const send=vi.fn();vi.stubGlobal('fetch',send);render(<App/>);
 expect(screen.getByRole('button',{name:/Compose my edition/})).toBeTruthy();
 expect(screen.queryByRole('button',{name:/Generate my magazine|Read sample edition/})).toBeNull();
 expect(screen.getByRole('link',{name:'Skip to your edition'})).toBeTruthy();
 expect(send).not.toHaveBeenCalled();
})
