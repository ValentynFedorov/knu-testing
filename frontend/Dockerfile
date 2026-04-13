FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Copy ONNX Runtime WASM files to public/ for browser access
RUN cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm public/ && \
    cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm public/ && \
    cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs public/ && \
    cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs public/

ARG NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_BACKEND_URL=${NEXT_PUBLIC_BACKEND_URL}

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- Production ---
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
