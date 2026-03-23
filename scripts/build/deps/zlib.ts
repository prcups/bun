/**
 * zlib — the classic deflate library. Cloudflare's fork has SIMD-accelerated
 * CRC and hash (2-4x faster compression on modern CPUs). Backs node:zlib
 * and the gzip Content-Encoding.
 */

import type { Dependency, NestedCmakeBuild } from "../source.ts";

const ZLIB_COMMIT = "886098f3f339617b4243b286f5ed364b9989e245";

export const zlib: Dependency = {
  name: "zlib",
  versionMacro: "ZLIB_HASH",

  source: () => ({
    kind: "github-archive",
    repo: "cloudflare/zlib",
    commit: ZLIB_COMMIT,
  }),

  // All patches are unconditional. The remove-machine-x64 patch deletes
  // an old workaround for a cmake bug fixed in 2011 — we require cmake
  // 3.24+ so the workaround is pure dead weight.
  patches: [
    "patches/zlib/CMakeLists.txt.patch",
    "patches/zlib/deflate.h.patch",
    "patches/zlib/ucm.cmake.patch",
    "scripts/build/patches/zlib/remove-machine-x64.patch",
    "patches/zlib/loongarch64-support.patch",
  ],

  build: cfg => {
    const spec: NestedCmakeBuild = {
      kind: "nested-cmake",
      targets: ["zlib"],
      args: {
        BUILD_EXAMPLES: "OFF",
      },
    };

    // Apple clang defines TARGET_OS_* macros that conflict with zlib's own
    // platform detection (it has `#ifdef TARGET_OS_MAC` gates that predate
    // apple's convention). The flag makes clang stop auto-defining them.
    // See https://gitlab.kitware.com/cmake/cmake/-/issues/25755.
    if (cfg.darwin) {
      spec.extraCFlags = ["-fno-define-target-os-macros"];
      spec.extraCxxFlags = ["-fno-define-target-os-macros"];
    }

    // LoongArch64: CMake may detect SSE support (clang supports -msse4.2 flag)
    // but SSE intrinsics are not available for this target.
    // Undefine SSE macros to use the software fallback in deflate.c.
    if (cfg.loong64) {
      spec.args.SKIP_CPUID_CHECK = "ON";
      spec.extraCFlags = spec.extraCFlags ?? [];
      spec.extraCFlags.push("-UHAS_SSE2", "-UHAS_SSSE3", "-UHAS_SSE42", "-UHAS_PCLMUL");
    }

    return spec;
  },

  provides: cfg => {
    // zlib's OUTPUT_NAME logic: on unix/mingw → "z", on MSVC → "zlib"
    // (or "zlibd" for CMAKE_BUILD_TYPE=Debug — cmake's Windows debug
    // suffix convention).
    let lib: string;
    if (cfg.windows) {
      lib = cfg.debug ? "zlibd" : "zlib";
    } else {
      lib = "z";
    }
    return {
      libs: [lib],
      includes: ["."],
    };
  },
};
