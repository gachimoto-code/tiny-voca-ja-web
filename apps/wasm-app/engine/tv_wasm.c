/* WASM wrapper around the tiny-voca C engine (vendor/tv.c).
 *
 * Exposes three functions to JavaScript:
 *   tvw_init(data_ptr, size)          -> 0 on success
 *   tvw_synth(ids_ptr, stress_ptr, n, voice, speed,
 *             out_samples_ptr, out_saturations_ptr) -> float* (tvw_free)
 *   tvw_free(ptr)
 *
 * Voice indices follow the checkpoint's speaker order: 0 = F2, 1 = M2.
 * The noise seed is fixed at 0 so output is reproducible.
 */
#include "tv.h"

#include <stdlib.h>

static tv_model model;
static int ready = 0;

int tvw_init(const unsigned char *data, int size) {
    if (tv_model_init(&model, data, (size_t)size) != 0) return -1;
    ready = 1;
    return 0;
}

float *tvw_synth(const int32_t *ids, const int32_t *stress, int n_tokens,
                 int voice, float speed, int *out_samples,
                 long *out_saturations) {
    if (!ready) {
        *out_samples = -1;
        return NULL;
    }
    tv_options opt = {0};
    opt.speed = speed;
    opt.seed = 0;
    tv_result result;
    int rc = tv_synthesize(&model, ids, stress, n_tokens, voice, &opt, &result);
    if (rc != 0) {
        *out_samples = rc;
        if (out_saturations) *out_saturations = 0;
        return NULL;
    }
    *out_samples = result.n_samples;
    if (out_saturations) *out_saturations = result.qacc_saturations;
    free(result.durations);
    return result.audio; /* caller frees with tvw_free */
}

void tvw_free(float *p) { free(p); }
