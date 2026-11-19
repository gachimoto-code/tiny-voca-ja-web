// Engine sources vendored from ngxson's tiny-voca ESP32-S3 port
// (https://github.com/ngxson/tiny-voca-esp32s3, Apache-2.0), with the
// Japanese-vocabulary patches from our ESP32 feasibility work applied:
//
//   - tv.c: token embedding table is 84 * TV_C (JA vocab 84, EN was 76)
//   - tv.c: vowel check uses the JA vowel id range (43..75)
//
// tv_kernels_ref.c (portable reference kernels) is used for the WASM
// build; the ESP32-specific kernels (tv_kernels_s3.c) are not included.
// tv_time_us() is provided by tv_kernels_ref.c.
