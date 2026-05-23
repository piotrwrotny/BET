import React from "react";

export default function Test() {
  const active = true;
  return (
    <div>
      <span className={`foo ${active ? "active" : ""}`}>bad template</span>
      <span className={"foo" + " bar"}>bad concat</span>
    </div>
  );
}
