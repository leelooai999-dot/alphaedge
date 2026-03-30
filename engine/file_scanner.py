"""
MonteCarloo File Scanner — Malicious Code Detection for User Uploads

Performs multi-layer security scanning on uploaded files:
1. Extension & MIME type validation (whitelist only)
2. File size limits
3. Archive inspection (zip bombs, nested archives)
4. Code pattern scanning (obfuscated eval, shell commands, network calls)
5. Pine Script specific validation
6. Binary header verification (magic bytes)

DISCLAIMER: This scanner catches common attack vectors but is NOT a
replacement for professional antivirus/sandbox analysis. All user-uploaded
products are provided "as-is" by their creators, not by MonteCarloo.
"""

import os
import re
import io
import zipfile
import hashlib
import json
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, field

# ── Config ────────────────────────────────────────────────────────────────────

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB per file
MAX_ARCHIVE_ENTRIES = 200  # max files inside a zip
MAX_ARCHIVE_RATIO = 100  # compression ratio > 100x = zip bomb suspect
MAX_NESTED_DEPTH = 2  # max archive-in-archive depth

# Allowed extensions (whitelist approach)
ALLOWED_EXTENSIONS = {
    # Pine Script
    ".pine", ".txt",
    # Data / Config
    ".json", ".csv", ".yaml", ".yml", ".toml",
    # Documentation
    ".md", ".pdf",
    # Images (for avatars, screenshots)
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
    # Archives
    ".zip",
    # Python scripts (for skills/personas)
    ".py",
    # JavaScript/TypeScript (for web plugins)
    ".js", ".ts",
}

# Dangerous file extensions that are NEVER allowed
BLOCKED_EXTENSIONS = {
    ".exe", ".bat", ".cmd", ".com", ".msi", ".scr", ".pif",
    ".vbs", ".vbe", ".wsf", ".wsh", ".ps1", ".psm1",
    ".sh", ".bash", ".csh", ".ksh",
    ".dll", ".so", ".dylib",
    ".jar", ".war", ".ear",
    ".app", ".dmg", ".pkg", ".deb", ".rpm",
    ".iso", ".img",
}

# ── Malicious Patterns ───────────────────────────────────────────────────────

# Patterns that indicate malicious intent in code files
DANGEROUS_CODE_PATTERNS = [
    # Shell execution
    (r'\bos\.system\s*\(', "os.system() call — arbitrary command execution"),
    (r'\bsubprocess\.\w+\s*\(', "subprocess call — arbitrary command execution"),
    (r'\beval\s*\(', "eval() call — arbitrary code execution"),
    (r'\bexec\s*\(', "exec() call — arbitrary code execution"),
    (r'\b__import__\s*\(', "dynamic import — potential code injection"),
    (r'\bcompile\s*\(.+exec', "compile+exec — obfuscated code execution"),
    
    # Network / exfiltration
    (r'\burllib\.request', "urllib network access — potential data exfiltration"),
    (r'\brequests\.(get|post|put|delete|patch)\s*\(', "HTTP request — potential data exfiltration"),
    (r'\bsocket\.socket\s*\(', "raw socket — potential backdoor"),
    (r'\bhttp\.client', "HTTP client — potential data exfiltration"),
    (r'\baiohttp\.ClientSession', "async HTTP — potential data exfiltration"),
    (r'\bhttpx\.(get|post|Client)', "httpx request — potential data exfiltration"),
    
    # File system abuse
    (r'\bshutil\.rmtree\s*\(', "recursive delete — destructive operation"),
    (r'\bos\.remove\s*\(', "file deletion — potentially destructive"),
    (r'\bos\.unlink\s*\(', "file deletion — potentially destructive"),
    (r'open\s*\(.*(\/etc\/|\/proc\/|\/sys\/|\.ssh)', "access to sensitive system paths"),
    (r'\bos\.environ\[', "environment variable access — potential credential theft"),
    (r'\bos\.getenv\s*\(', "environment variable read — potential credential theft"),
    
    # Obfuscation red flags
    (r'base64\.b64decode\s*\(', "base64 decode — possible obfuscated payload"),
    (r'\\x[0-9a-fA-F]{2}.*\\x[0-9a-fA-F]{2}.*\\x[0-9a-fA-F]{2}', "hex-encoded strings — possible obfuscated payload"),
    (r'chr\(\d+\)\s*\+\s*chr\(\d+\)', "chr() concatenation — obfuscation technique"),
    (r'getattr\s*\(.+,\s*["\']__', "getattr with dunder — reflection-based attack"),
    
    # Crypto mining
    (r'(monero|xmr|stratum|mining|hashrate|cryptonight)', "crypto mining reference"),
    
    # Reverse shells
    (r'(\/bin\/sh|\/bin\/bash)\s*-[ic]', "shell invocation — possible reverse shell"),
    (r'mkfifo|nc\s+-[el]|ncat\s+-[el]', "netcat/pipe — possible reverse shell"),
]

# Pine Script should NOT contain these (Pine is sandboxed but let's be strict)
PINE_SUSPICIOUS_PATTERNS = [
    (r'\bimport\s+', "import statement in Pine Script (not valid Pine)"),
    (r'<script', "HTML script tag in Pine Script"),
    (r'javascript:', "JavaScript URI in Pine Script"),
]

# ── Dataclass ─────────────────────────────────────────────────────────────────

@dataclass
class ScanResult:
    """Result of scanning a file."""
    safe: bool = True
    risk_level: str = "clean"  # clean, low, medium, high, critical
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    file_hash: str = ""
    file_size: int = 0
    mime_type: str = ""
    scan_details: Dict = field(default_factory=dict)
    
    def to_dict(self) -> dict:
        return {
            "safe": self.safe,
            "risk_level": self.risk_level,
            "warnings": self.warnings,
            "errors": self.errors,
            "file_hash": self.file_hash,
            "file_size": self.file_size,
            "scan_details": self.scan_details,
        }


# ── Scanner Functions ─────────────────────────────────────────────────────────

def scan_file(filename: str, content: bytes) -> ScanResult:
    """
    Main entry point: scan a file for malicious content.
    
    Args:
        filename: Original filename (used for extension check)
        content: Raw file bytes
        
    Returns:
        ScanResult with safety verdict and details
    """
    result = ScanResult()
    result.file_size = len(content)
    result.file_hash = hashlib.sha256(content).hexdigest()
    
    # 1. Size check
    if len(content) > MAX_FILE_SIZE_BYTES:
        result.safe = False
        result.risk_level = "critical"
        result.errors.append(f"File too large: {len(content)} bytes (max {MAX_FILE_SIZE_BYTES})")
        return result
    
    # 2. Extension check
    ext = _get_extension(filename)
    if ext in BLOCKED_EXTENSIONS:
        result.safe = False
        result.risk_level = "critical"
        result.errors.append(f"Blocked file type: {ext}")
        return result
    
    if ext not in ALLOWED_EXTENSIONS:
        result.safe = False
        result.risk_level = "high"
        result.errors.append(f"File type not allowed: {ext}. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}")
        return result
    
    # 3. Magic bytes check (verify extension matches actual content)
    magic_check = _check_magic_bytes(content, ext)
    if magic_check:
        result.warnings.append(magic_check)
        result.risk_level = _escalate(result.risk_level, "medium")
    
    # 4. Archive inspection
    if ext == ".zip":
        archive_result = _scan_archive(content)
        result.warnings.extend(archive_result.warnings)
        result.errors.extend(archive_result.errors)
        if not archive_result.safe:
            result.safe = False
            result.risk_level = _escalate(result.risk_level, archive_result.risk_level)
        result.scan_details["archive"] = archive_result.scan_details
        return result
    
    # 5. Code content scanning
    if ext in {".py", ".js", ".ts", ".pine", ".txt", ".json", ".yaml", ".yml", ".toml", ".md", ".csv"}:
        try:
            text = content.decode("utf-8", errors="replace")
            code_result = _scan_code_content(text, ext)
            result.warnings.extend(code_result.warnings)
            result.errors.extend(code_result.errors)
            if not code_result.safe:
                result.safe = False
                result.risk_level = _escalate(result.risk_level, code_result.risk_level)
            result.scan_details["code_scan"] = code_result.scan_details
        except Exception:
            result.warnings.append("Could not decode file as text for content scanning")
    
    # 6. SVG specific check (can contain JS)
    if ext == ".svg":
        try:
            text = content.decode("utf-8", errors="replace")
            svg_result = _scan_svg(text)
            result.warnings.extend(svg_result.warnings)
            result.errors.extend(svg_result.errors)
            if not svg_result.safe:
                result.safe = False
                result.risk_level = _escalate(result.risk_level, svg_result.risk_level)
        except Exception:
            pass
    
    # Determine final risk level
    if result.errors:
        result.safe = False
        result.risk_level = _escalate(result.risk_level, "high")
    elif len(result.warnings) >= 3:
        result.risk_level = _escalate(result.risk_level, "medium")
    elif result.warnings:
        result.risk_level = _escalate(result.risk_level, "low")
    
    return result


def scan_files_batch(files: List[Tuple[str, bytes]]) -> Dict[str, ScanResult]:
    """Scan multiple files, return results keyed by filename."""
    results = {}
    total_size = 0
    for filename, content in files:
        total_size += len(content)
        if total_size > MAX_FILE_SIZE_BYTES * 3:  # 150MB total limit for batch
            results[filename] = ScanResult(
                safe=False,
                risk_level="critical",
                errors=["Total upload size exceeds limit"],
            )
            break
        results[filename] = scan_file(filename, content)
    return results


# ── Internal Scanners ─────────────────────────────────────────────────────────

def _scan_code_content(text: str, ext: str) -> ScanResult:
    """Scan code/text content for malicious patterns."""
    result = ScanResult()
    result.scan_details = {"patterns_checked": 0, "patterns_matched": []}
    
    patterns = DANGEROUS_CODE_PATTERNS
    if ext == ".pine":
        patterns = patterns + PINE_SUSPICIOUS_PATTERNS
    
    for pattern, description in patterns:
        result.scan_details["patterns_checked"] += 1
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            result.scan_details["patterns_matched"].append({
                "pattern": description,
                "count": len(matches),
            })
            # Code execution patterns are high risk
            if any(kw in description.lower() for kw in ["execution", "backdoor", "reverse shell", "mining"]):
                result.errors.append(f"🚫 {description} (found {len(matches)}x)")
                result.safe = False
                result.risk_level = _escalate(result.risk_level, "high")
            else:
                result.warnings.append(f"⚠️ {description} (found {len(matches)}x)")
                result.risk_level = _escalate(result.risk_level, "medium")
    
    # Check for suspiciously long single lines (potential obfuscation)
    for i, line in enumerate(text.split("\n"), 1):
        if len(line) > 5000:
            result.warnings.append(f"Suspiciously long line ({len(line)} chars) at line {i} — possible obfuscation")
            result.risk_level = _escalate(result.risk_level, "low")
            break  # Only report once
    
    return result


def _scan_archive(content: bytes, depth: int = 0) -> ScanResult:
    """Scan a zip archive for zip bombs and malicious contents."""
    result = ScanResult()
    result.scan_details = {"entries": 0, "total_uncompressed": 0, "nested_archives": 0}
    
    if depth > MAX_NESTED_DEPTH:
        result.safe = False
        result.risk_level = "high"
        result.errors.append(f"Archive nesting too deep (depth {depth}) — possible zip bomb")
        return result
    
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            entries = zf.infolist()
            result.scan_details["entries"] = len(entries)
            
            # Check entry count
            if len(entries) > MAX_ARCHIVE_ENTRIES:
                result.safe = False
                result.risk_level = "high"
                result.errors.append(f"Too many files in archive: {len(entries)} (max {MAX_ARCHIVE_ENTRIES})")
                return result
            
            total_uncompressed = sum(e.file_size for e in entries)
            result.scan_details["total_uncompressed"] = total_uncompressed
            
            # Zip bomb detection: compression ratio
            if len(content) > 0:
                ratio = total_uncompressed / len(content)
                if ratio > MAX_ARCHIVE_RATIO:
                    result.safe = False
                    result.risk_level = "critical"
                    result.errors.append(f"Suspicious compression ratio: {ratio:.0f}x (max {MAX_ARCHIVE_RATIO}x) — possible zip bomb")
                    return result
            
            # Scan each entry
            for entry in entries:
                entry_ext = _get_extension(entry.filename)
                
                # Block dangerous files inside archives
                if entry_ext in BLOCKED_EXTENSIONS:
                    result.safe = False
                    result.risk_level = "critical"
                    result.errors.append(f"Blocked file type inside archive: {entry.filename}")
                    continue
                
                # Check for path traversal attacks
                if ".." in entry.filename or entry.filename.startswith("/"):
                    result.safe = False
                    result.risk_level = "critical"
                    result.errors.append(f"Path traversal attempt: {entry.filename}")
                    continue
                
                # Recursively scan nested archives
                if entry_ext == ".zip":
                    result.scan_details["nested_archives"] += 1
                    try:
                        nested_content = zf.read(entry.filename)
                        nested = _scan_archive(nested_content, depth + 1)
                        if not nested.safe:
                            result.safe = False
                            result.risk_level = _escalate(result.risk_level, nested.risk_level)
                            result.errors.extend(nested.errors)
                    except Exception:
                        result.warnings.append(f"Could not inspect nested archive: {entry.filename}")
                
                # Scan code files inside the archive
                if entry_ext in {".py", ".js", ".ts", ".pine", ".txt"}:
                    try:
                        file_content = zf.read(entry.filename)
                        text = file_content.decode("utf-8", errors="replace")
                        code_result = _scan_code_content(text, entry_ext)
                        if not code_result.safe:
                            result.safe = False
                            result.risk_level = _escalate(result.risk_level, code_result.risk_level)
                            for err in code_result.errors:
                                result.errors.append(f"[{entry.filename}] {err}")
                        for warn in code_result.warnings:
                            result.warnings.append(f"[{entry.filename}] {warn}")
                    except Exception:
                        pass
    
    except zipfile.BadZipFile:
        result.safe = False
        result.risk_level = "high"
        result.errors.append("Invalid or corrupted ZIP file")
    except Exception as e:
        result.safe = False
        result.risk_level = "medium"
        result.errors.append(f"Could not fully inspect archive: {str(e)}")
    
    return result


def _scan_svg(text: str) -> ScanResult:
    """Scan SVG for embedded scripts (XSS vector)."""
    result = ScanResult()
    
    dangerous_svg_patterns = [
        (r'<script', "Embedded <script> tag in SVG — XSS vector"),
        (r'on\w+\s*=', "Event handler attribute in SVG (onclick, onload, etc.) — XSS vector"),
        (r'javascript:', "javascript: URI in SVG — XSS vector"),
        (r'data:text/html', "data:text/html URI in SVG — XSS vector"),
        (r'<foreignObject', "foreignObject in SVG — can embed arbitrary HTML"),
        (r'xlink:href\s*=\s*["\'](?!#)', "External xlink:href in SVG — potential exfiltration"),
    ]
    
    for pattern, description in dangerous_svg_patterns:
        if re.search(pattern, text, re.IGNORECASE):
            result.safe = False
            result.risk_level = "high"
            result.errors.append(f"🚫 {description}")
    
    return result


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_extension(filename: str) -> str:
    """Get lowercase file extension."""
    _, ext = os.path.splitext(filename.lower())
    return ext


def _check_magic_bytes(content: bytes, expected_ext: str) -> Optional[str]:
    """Verify file magic bytes match expected extension."""
    if len(content) < 4:
        return None
    
    magic_map = {
        ".zip": [b"PK\x03\x04", b"PK\x05\x06"],
        ".png": [b"\x89PNG"],
        ".jpg": [b"\xff\xd8\xff"],
        ".jpeg": [b"\xff\xd8\xff"],
        ".gif": [b"GIF87a", b"GIF89a"],
        ".pdf": [b"%PDF"],
        ".webp": None,  # RIFF....WEBP — needs 12 bytes
    }
    
    expected_magic = magic_map.get(expected_ext)
    if expected_magic is None:
        return None  # No magic bytes to check for this type
    
    # Special case: webp
    if expected_ext == ".webp" and len(content) >= 12:
        if not (content[:4] == b"RIFF" and content[8:12] == b"WEBP"):
            return f"File claims to be {expected_ext} but magic bytes don't match — possible disguised file"
        return None
    
    for magic in expected_magic:
        if content[:len(magic)] == magic:
            return None  # Match found
    
    return f"File claims to be {expected_ext} but magic bytes don't match — possible disguised file"


_RISK_ORDER = {"clean": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}

def _escalate(current: str, new: str) -> str:
    """Return the higher of two risk levels."""
    if _RISK_ORDER.get(new, 0) > _RISK_ORDER.get(current, 0):
        return new
    return current


# ── Disclaimer Text ───────────────────────────────────────────────────────────

PRODUCT_DISCLAIMER = """
⚠️ USER-GENERATED CONTENT DISCLAIMER

This product was created and uploaded by a third-party creator, NOT by 
MonteCarloo. MonteCarloo provides the marketplace platform but does NOT 
endorse, verify, warrant, or guarantee any user-uploaded products.

BY DOWNLOADING OR USING THIS PRODUCT, YOU ACKNOWLEDGE AND AGREE THAT:

1. MonteCarloo is not responsible for the accuracy, quality, safety, or 
   legality of any user-uploaded content.

2. All user-uploaded products are provided "AS-IS" without warranty of 
   any kind, express or implied.

3. MonteCarloo performs automated security scanning but cannot guarantee 
   that files are free from all vulnerabilities, malware, or harmful code.

4. You use downloaded products at your own risk. MonteCarloo shall not be 
   liable for any damages, losses, or harm resulting from your use of 
   user-uploaded products.

5. The creator of this product is solely responsible for its content, 
   including any intellectual property claims, licensing, and compliance 
   with applicable laws.

6. If you believe a product violates our terms, contains malicious code, 
   or infringes on your rights, please report it immediately.

MonteCarloo reserves the right to remove any product at any time without 
notice if it is found to violate our terms of service or poses a risk to 
our users.
""".strip()


CREATOR_UPLOAD_TERMS = """
By uploading a product to the MonteCarloo Marketplace, you agree that:

1. You own or have the right to distribute the uploaded content.
2. Your product does not contain malicious code, malware, or backdoors.
3. Your product does not infringe on any third-party intellectual property.
4. You grant MonteCarloo a license to host, scan, and distribute your product.
5. MonteCarloo may remove your product if it violates these terms.
6. You are solely responsible for supporting your product and its users.
7. MonteCarloo is not liable for any issues arising from your product.
""".strip()
