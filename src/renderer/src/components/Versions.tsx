import { useState } from 'react'

function Versions(): React.JSX.Element {
  const [versions] = useState(window.electron.process.versions)

  return (
    <ul className="absolute bottom-[30px] mx-auto inline-flex items-center overflow-hidden rounded-[22px] bg-[#202127] py-[15px] font-mono backdrop-blur-xl max-[620px]:hidden">
      <li className="border-r border-(--ev-c-gray-1) px-5 text-sm leading-3.5 opacity-80 last:border-0">
        Electron v{versions.electron}
      </li>
      <li className="border-r border-(--ev-c-gray-1) px-5 text-sm leading-3.5 opacity-80 last:border-0">
        Chromium v{versions.chrome}
      </li>
      <li className="border-r border-(--ev-c-gray-1) px-5 text-sm leading-3.5 opacity-80 last:border-0">
        Node v{versions.node}
      </li>
    </ul>
  )
}

export default Versions
