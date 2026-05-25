use regex::Regex;
use std::sync::OnceLock;

static REDACT_PATTERNS: OnceLock<Vec<(Regex, &'static str)>> = OnceLock::new();

fn get_redact_patterns() -> &'static Vec<(Regex, &'static str)> {
    REDACT_PATTERNS.get_or_init(|| {
        vec![
            // Bearer tokens
            (Regex::new(r"(?i)bearer\s+[a-zA-Z0-9_\-\.\~=\+/]+").unwrap(), "Bearer [REDACTED]"),
            
            // CLI/API Token patterns
            (Regex::new(r"(?i)sk-[a-zA-Z0-9_\-]{16,}").unwrap(), "[REDACTED]"),
            (Regex::new(r"(?i)ghp_[a-zA-Z0-9]{20,}").unwrap(), "[REDACTED]"),
            (Regex::new(r"(?i)github_pat_[a-zA-Z0-9_]{20,}").unwrap(), "[REDACTED]"),
            
            // JSON key-value pairs
            (Regex::new(r#"(?i)"(access_token|refresh_token|id_token|api_key|cookie|session|token|credential|secret)"\s*:\s*"[^"]+""#).unwrap(), r#""$1": "[REDACTED]""#),
            
            // URL / Query parameters / Form fields
            (Regex::new(r"(?i)(access_token|refresh_token|id_token|api_key|cookie|session|token|credential|secret)=[a-zA-Z0-9_\-\.\~%=\+/]+").unwrap(), "$1=[REDACTED]"),
        ]
    })
}

pub fn redact_secret(input: &str) -> String {
    let mut redacted = input.to_string();
    for (re, replacement) in get_redact_patterns() {
        redacted = re.replace_all(&redacted, *replacement).to_string();
    }
    redacted
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_redaction() {
        let raw = "Authorization: Bearer my_super_secret_token_123";
        assert_eq!(redact_secret(raw), "Authorization: Bearer [REDACTED]");

        let sk = "My key is sk-ant-sid1238912389123890123";
        assert_eq!(redact_secret(sk), "My key is [REDACTED]");

        let json = r#"{"access_token": "secret_abc123", "normal": 45}"#;
        assert_eq!(
            redact_secret(json),
            r#"{"access_token": "[REDACTED]", "normal": 45}"#
        );

        let query = "https://example.com/api?api_key=xyz123&other=45";
        assert_eq!(
            redact_secret(query),
            "https://example.com/api?api_key=[REDACTED]&other=45"
        );
    }
}
