import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 26,
          background: "#f5f5f5",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "serif",
          fontWeight: 400,
          color: "#1a1a1a",
          letterSpacing: "-0.02em",
        }}
      >
        Q
      </div>
    ),
    {
      ...size,
    }
  );
}

