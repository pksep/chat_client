fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

pub fn build_toast_xml(title: &str, body: Option<&str>, payload: &str) -> String {
    let escaped_title = escape_xml(title);
    let escaped_body = body
        .filter(|value| !value.trim().is_empty())
        .map(|value| format!(r#"<text id="2">{}</text>"#, escape_xml(value)))
        .unwrap_or_default();
    let escaped_payload = escape_xml(payload);
    let data = serde_json::from_str::<serde_json::Value>(payload).ok();
    let incoming_call = data.as_ref().is_some_and(|data| {
        data.get("type").and_then(|value| value.as_str()) == Some("incoming_call")
            && data
                .get("roomId")
                .and_then(|value| value.as_str())
                .is_some_and(|id| !id.is_empty())
    });
    let (attributes, actions) = if incoming_call {
        let mut data = data.unwrap();
        let actions = [("accept", "Принять"), ("decline", "Отклонить")]
            .iter()
            .map(|(action, label)| {
                data["action"] = serde_json::Value::String(action.to_string());
                format!(
                    r#"<action content="{label}" arguments="{}" activationType="foreground"/>"#,
                    escape_xml(&data.to_string())
                )
            })
            .collect::<String>();
        (
            r#"duration="long" scenario="incomingCall""#,
            format!("<actions>{actions}</actions><audio silent=\"true\"/>"),
        )
    } else {
        (r#"duration="short""#, String::new())
    };
    format!(
        r#"<toast {attributes} launch="{escaped_payload}"><visual><binding template="ToastGeneric"><text id="1">{escaped_title}</text>{escaped_body}</binding></visual>{actions}</toast>"#
    )
}
