export type ResolvedFeatureDSLTransform = {
  translate?: readonly number[]
  rotate?: {
    axis: readonly number[]
    angleRadians: number
    origin?: readonly number[]
  }
  scale: readonly number[]
}

export type OpenCascadeModule = Record<string, any> & {
  FS: {
    writeFile?: (path: string, data: string | Uint8Array) => void
    createDataFile?: (
      parent: string,
      name: string,
      data: string | Uint8Array,
      canRead: boolean,
      canWrite: boolean,
    ) => void
    readFile: (path: string, options?: { encoding?: 'utf8' | 'binary' }) => string | Uint8Array
    unlink: (path: string) => void
  }
}
