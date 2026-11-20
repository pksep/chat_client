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
    } else if data.as_ref().is_some_and(is_message_notification) {
        let mut data = data.unwrap();
        let actions = [
            ("reply", "Ответить"),
            ("like", "Нравится"),
            ("read", "Прочитано"),
        ]
        .iter()
        .map(|(action, label)| {
            data["action"] = serde_json::Value::String(action.to_string());
            let input = if *action == "reply" {
                r#" hint-inputId="reply_text""#
            } else {
                ""
            };
            format!(
                r#"<action content="{label}" arguments="{}" activationType="foreground"{input}/>"#,
                escape_xml(&data.to_string())
            )
        })
        .collect::<String>();
        (
            r#"duration="long""#,
            format!(
                r#"<actions><input id="reply_text" type="text" placeHolderContent="Написать ответ…"/>{actions}</actions>"#
            ),
        )
    } else {
        (r#"duration="short""#, String::new())
    };
    format!(
        r#"<toast {attributes} launch="{escaped_payload}"><visual><binding template="ToastGeneric"><text id="1">{escaped_title}</text>{escaped_body}</binding></visual>{actions}</toast>"#
    )
}

fn is_message_notification(data: &serde_json::Value) -> bool {
    data.get("type").and_then(|value| value.as_str()) == Some("new_message")
        && ["topicId", "messageId", "accountId"].iter().all(|key| {
            data.get(key)
                .and_then(|value| value.as_str())
                .is_some_and(|value| !value.is_empty())
        })
}

pub fn with_reply_input(payload: &str, text: Option<&str>) -> String {
    let Ok(mut data) = serde_json::from_str::<serde_json::Value>(payload) else {
        return payload.to_string();
    };
    if is_message_notification(&data)
        && data.get("action").and_then(|value| value.as_str()) == Some("reply")
    {
        data["replyText"] = serde_json::Value::String(text.unwrap_or_default().to_string());
    }
    data.to_string()
}

pub fn activation_needs_window(payload: &str) -> bool {
    let Ok(data) = serde_json::from_str::<serde_json::Value>(payload) else {
        return true;
    };
    !(is_message_notification(&data)
        && matches!(
            data.get("action").and_then(|value| value.as_str()),
            Some("reply" | "like" | "read")
        ))
}
