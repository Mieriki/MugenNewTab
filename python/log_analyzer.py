import tkinter as tk
from tkinter import ttk, filedialog, scrolledtext, messagebox
import json
import os
import re
import mmap
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import threading


class LogLevel(Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


@dataclass
class LogEntry:
    timestamp: Optional[str]
    level: Optional[LogLevel]
    message: str
    line_number: int
    source_file: str
    matched_by: List[str]
    parsed_time: Optional[datetime] = None  # 新增：解析后的时间对象
    
    def to_dict(self) -> Dict:
        return {
            "timestamp": self.timestamp,
            "level": self.level.value if self.level else None,
            "message": self.message,
            "line_number": self.line_number,
            "source_file": self.source_file,
            "matched_by": self.matched_by,
            "parsed_time": self.parsed_time.isoformat() if self.parsed_time else None
        }


class ConfigManager:
    def __init__(self, config_dir="./config"):
        self.config_dir = Path(config_dir)
        self.config_file = self.config_dir / "config.json"
        self.ensure_config_exists()
    
    def ensure_config_exists(self):
        """确保配置文件存在，不存在则创建默认配置"""
        self.config_dir.mkdir(parents=True, exist_ok=True)
        
        if not self.config_file.exists():
            default_config = {
                "log_levels": ["ERROR", "CRITICAL"],
                "keywords": ["exception", "failed", "timeout", "refused", "error"],
                "error_patterns": [
                    r"Traceback \(most recent call last\)",
                    r"Error:",
                    r"Exception:",
                    r"Failed to",
                    r"Connection refused",
                    r"Permission denied"
                ],
                "regex_patterns": [
                    r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b"
                ],
                "exclude_patterns": [
                    r"DEBUG.*health.check"
                ],
                "timestamp_pattern": r"\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}",
                "log_level_pattern": r"\b(DEBUG|INFO|WARNING|ERROR|CRITICAL)\b",
                "time_range": {
                    "enabled": False,
                    "start_time": "",
                    "end_time": "",
                    "time_format": "%Y-%m-%d %H:%M:%S",
                    "auto_detect_format": True
                },
                "settings": {
                    "auto_save": True,
                    "default_output_dir": "./output",
                    "file_pattern": "*.log",
                    "recursive": True
                }
            }
            self.save_config(default_config)
            print(f"已创建默认配置文件: {self.config_file}")
    
    def load_config(self) -> Dict:
        try:
            with open(self.config_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            messagebox.showerror("配置错误", f"加载配置文件失败: {e}")
            return {}
    
    def save_config(self, config: Dict):
        try:
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
        except Exception as e:
            messagebox.showerror("配置错误", f"保存配置文件失败: {e}")


class TimeRangeFilter:
    """时间段过滤器"""
    def __init__(self, config: Dict):
        time_config = config.get('time_range', {})
        self.enabled = time_config.get('enabled', False)
        self.start_time_str = time_config.get('start_time', '')
        self.end_time_str = time_config.get('end_time', '')
        self.time_format = time_config.get('time_format', '%Y-%m-%d %H:%M:%S')
        self.auto_detect = time_config.get('auto_detect_format', True)
        
        self.start_dt: Optional[datetime] = None
        self.end_dt: Optional[datetime] = None
        self._parse_time_range()
    
    def _parse_time_range(self):
        """解析时间范围"""
        if not self.enabled:
            return
        
        # 支持相对时间语法
        now = datetime.now()
        
        # 解析开始时间
        if self.start_time_str:
            self.start_dt = self._parse_time_string(self.start_time_str, now)
        
        # 解析结束时间
        if self.end_time_str:
            self.end_dt = self._parse_time_string(self.end_time_str, now)
    
    def _parse_time_string(self, time_str: str, reference: datetime) -> Optional[datetime]:
        """解析时间字符串，支持绝对时间和相对时间"""
        time_str = time_str.strip()
        
        # 尝试相对时间格式：1h, 30m, 1d, 1w 等
        relative_match = re.match(r'^-?(\d+)([hmwd])$', time_str.lower())
        if relative_match:
            value, unit = int(relative_match.group(1)), relative_match.group(2)
            delta = {
                'h': timedelta(hours=value),
                'm': timedelta(minutes=value),
                'w': timedelta(weeks=value),
                'd': timedelta(days=value)
            }.get(unit, timedelta(hours=value))
            return reference - delta
        
        # 尝试标准格式
        formats_to_try = [self.time_format]
        if self.auto_detect:
            formats_to_try.extend([
                '%Y-%m-%d %H:%M:%S',
                '%Y-%m-%d %H:%M',
                '%Y-%m-%d',
                '%d/%m/%Y %H:%M:%S',
                '%m/%d/%Y %H:%M:%S',
                '%H:%M:%S',
                '%H:%M'
            ])
        
        for fmt in formats_to_try:
            try:
                parsed = datetime.strptime(time_str, fmt)
                # 如果格式不包含日期，使用当前日期
                if '%Y' not in fmt:
                    parsed = parsed.replace(year=reference.year, month=reference.month, day=reference.day)
                return parsed
            except ValueError:
                continue
        
        return None
    
    def is_in_range(self, dt: Optional[datetime]) -> bool:
        """检查时间是否在范围内"""
        if not self.enabled or dt is None:
            return True
        
        if self.start_dt and dt < self.start_dt:
            return False
        if self.end_dt and dt > self.end_dt:
            return False
        return True
    
    def get_description(self) -> str:
        """获取时间范围描述"""
        if not self.enabled:
            return "时间筛选: 禁用"
        parts = []
        if self.start_dt:
            parts.append(f"开始: {self.start_dt.strftime('%Y-%m-%d %H:%M:%S')}")
        if self.end_dt:
            parts.append(f"结束: {self.end_dt.strftime('%Y-%m-%d %H:%M:%S')}")
        return "时间筛选: " + (", ".join(parts) if parts else "未设置")


class LogAnalyzerEngine:
    def __init__(self, config: Dict):
        self.config = config
        self.stats = {
            'total_lines': 0,
            'matched_lines': 0,
            'time_filtered': 0,
            'by_level': {lvl.value: 0 for lvl in LogLevel},
            'by_rule': {},
            'current_file': ''
        }
        self.time_filter = TimeRangeFilter(config)
        self._compile_patterns()
    
    def _compile_patterns(self):
        self._regexes = []
        self._excludes = []
        self._error_regexes = []
        
        for pattern in self.config.get('regex_patterns', []):
            try:
                self._regexes.append(re.compile(pattern, re.IGNORECASE))
            except re.error as e:
                print(f"正则编译失败: {pattern}, 错误: {e}")
        
        for pattern in self.config.get('exclude_patterns', []):
            try:
                self._excludes.append(re.compile(pattern, re.IGNORECASE))
            except re.error as e:
                print(f"排除模式编译失败: {pattern}")
        
        for pattern in self.config.get('error_patterns', []):
            try:
                self._error_regexes.append(re.compile(pattern, re.IGNORECASE))
            except re.error:
                pass
        
        ts_pattern = self.config.get('timestamp_pattern')
        self._timestamp_re = re.compile(ts_pattern) if ts_pattern else None
        
        lvl_pattern = self.config.get('log_level_pattern')
        self._level_re = re.compile(lvl_pattern) if lvl_pattern else None
        
        self._target_levels = [LogLevel(l) for l in self.config.get('log_levels', [])]
        self._keywords = self.config.get('keywords', [])
        
        # 时间格式用于解析日志中的时间戳
        self._time_format = self.config.get('time_range', {}).get('time_format', '%Y-%m-%d %H:%M:%S')
        self._auto_time_format = self.config.get('time_range', {}).get('auto_detect_format', True)
    
    def _extract_timestamp(self, line: str) -> Tuple[Optional[str], Optional[datetime]]:
        """提取时间戳字符串和解析后的datetime对象"""
        if not self._timestamp_re:
            return None, None
        
        match = self._timestamp_re.search(line)
        if not match:
            return None, None
        
        ts_str = match.group(0)
        dt = self._parse_log_timestamp(ts_str)
        return ts_str, dt
    
    def _parse_log_timestamp(self, ts_str: str) -> Optional[datetime]:
        """解析日志中的时间戳"""
        formats_to_try = [self._time_format]
        
        if self._auto_time_format:
            formats_to_try.extend([
                '%Y-%m-%d %H:%M:%S',
                '%Y-%m-%d %H:%M:%S.%f',
                '%Y-%m-%d %H:%M',
                '%Y-%m-%d',
                '%d/%m/%Y %H:%M:%S',
                '%m/%d/%Y %H:%M:%S',
                '%Y/%m/%d %H:%M:%S',
                '%H:%M:%S',
                '%H:%M:%S.%f',
                '%H:%M',
                '%d-%b-%Y %H:%M:%S',  # 常见Linux日志格式
                '%b %d %H:%M:%S'      # Syslog格式
            ])
        
        for fmt in formats_to_try:
            try:
                return datetime.strptime(ts_str, fmt)
            except ValueError:
                continue
        return None
    
    def _extract_level(self, line: str) -> Optional[LogLevel]:
        if self._level_re:
            match = self._level_re.search(line)
            if match:
                return LogLevel.from_string(match.group(1))
        return None
    
    def _should_exclude(self, line: str) -> bool:
        for pattern in self._excludes:
            if pattern.search(line):
                return True
        return False
    
    def analyze_line(self, line: str, line_number: int, source_file: str) -> Optional[LogEntry]:
        if self._should_exclude(line):
            return None
        
        # 提取时间和检查时间范围
        ts_str, parsed_dt = self._extract_timestamp(line)
        
        # 如果启用了时间筛选但无法解析时间，可以选择跳过或保留
        # 这里选择：如果时间筛选启用但无法解析，则跳过该行（保守策略）
        if self.time_filter.enabled and parsed_dt is None:
            return None
        
        # 检查时间范围
        if not self.time_filter.is_in_range(parsed_dt):
            self.stats['time_filtered'] += 1
            return None
        
        matched_rules = []
        level = self._extract_level(line)
        
        if level and level in self._target_levels:
            matched_rules.append(f"level:{level.value}")
        
        for keyword in self._keywords:
            if keyword.lower() in line.lower():
                matched_rules.append(f"keyword:{keyword}")
                break
        
        for pattern in self._error_regexes:
            if pattern.search(line):
                matched_rules.append("error_pattern")
                break
        
        for i, pattern in enumerate(self._regexes):
            if pattern.search(line):
                matched_rules.append(f"regex:{i+1}")
                break
        
        if matched_rules:
            self.stats['matched_lines'] += 1
            if level:
                self.stats['by_level'][level.value] += 1
            for rule in matched_rules:
                self.stats['by_rule'][rule] = self.stats['by_rule'].get(rule, 0) + 1
            
            return LogEntry(
                timestamp=ts_str,
                level=level,
                message=line.strip(),
                line_number=line_number,
                source_file=source_file,
                matched_by=matched_rules,
                parsed_time=parsed_dt
            )
        return None
    
    def analyze_file(self, file_path: str, progress_callback=None) -> List[LogEntry]:
        entries = []
        self.stats['current_file'] = file_path
        file_size = os.path.getsize(file_path)
        
        try:
            if file_size > 10 * 1024 * 1024:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    with mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as mm:
                        line_number = 0
                        for line in iter(mm.readline, b''):
                            line_number += 1
                            line = line.decode('utf-8', errors='ignore')
                            self.stats['total_lines'] += 1
                            
                            entry = self.analyze_line(line, line_number, file_path)
                            if entry:
                                entries.append(entry)
                            
                            if progress_callback and line_number % 1000 == 0:
                                progress_callback(line_number, file_size, file_path)
            else:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    for line_number, line in enumerate(f, 1):
                        self.stats['total_lines'] += 1
                        entry = self.analyze_line(line, line_number, file_path)
                        if entry:
                            entries.append(entry)
                        
                        if progress_callback and line_number % 1000 == 0:
                            progress_callback(line_number, file_size, file_path)
        except Exception as e:
            print(f"分析文件失败 {file_path}: {e}")
        
        return entries


class LogAnalyzerGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("日志分析工具 - 支持时间段匹配")
        self.root.geometry("1100x800")
        self.root.minsize(1000, 700)
        
        self.config_manager = ConfigManager()
        self.current_config = self.config_manager.load_config()
        self.analyzer = None
        self.is_analyzing = False
        
        self._build_ui()
        self._load_config_to_ui()
    
    def _build_ui(self):
        # 主容器
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        
        # 左侧配置面板
        left_frame = ttk.LabelFrame(main_frame, text="分析配置", padding="10")
        left_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S), padx=5)
        main_frame.columnconfigure(0, weight=1)
        main_frame.rowconfigure(0, weight=1)
        
        # 时间段筛选框架
        self._build_time_frame(left_frame)
        
        # 分隔线
        ttk.Separator(left_frame, orient='horizontal').pack(fill=tk.X, pady=10)
        
        # 日志级别
        lvl_frame = ttk.LabelFrame(left_frame, text="日志级别", padding="5")
        lvl_frame.pack(fill=tk.X, pady=5)
        self.level_vars = {}
        for lvl in LogLevel:
            var = tk.BooleanVar()
            cb = ttk.Checkbutton(lvl_frame, text=lvl.value, variable=var)
            cb.pack(side=tk.LEFT, padx=5)
            self.level_vars[lvl.value] = var
        
        # 关键字
        kw_frame = ttk.LabelFrame(left_frame, text="关键字 (每行一个)", padding="5")
        kw_frame.pack(fill=tk.BOTH, expand=True, pady=5)
        self.keywords_text = tk.Text(kw_frame, height=4, wrap=tk.WORD)
        self.keywords_text.pack(fill=tk.BOTH, expand=True)
        
        # 正则表达式
        regex_frame = ttk.LabelFrame(left_frame, text="正则表达式 (每行一个)", padding="5")
        regex_frame.pack(fill=tk.BOTH, expand=True, pady=5)
        self.regex_text = tk.Text(regex_frame, height=4, wrap=tk.WORD)
        self.regex_text.pack(fill=tk.BOTH, expand=True)
        
        # 排除模式
        exclude_frame = ttk.LabelFrame(left_frame, text="排除模式 (每行一个)", padding="5")
        exclude_frame.pack(fill=tk.BOTH, expand=True, pady=5)
        self.exclude_text = tk.Text(exclude_frame, height=3, wrap=tk.WORD)
        self.exclude_text.pack(fill=tk.BOTH, expand=True)
        
        # 右侧操作面板
        right_frame = ttk.LabelFrame(main_frame, text="操作", padding="10")
        right_frame.grid(row=0, column=1, sticky=(tk.W, tk.E, tk.N, tk.S), padx=5)
        main_frame.columnconfigure(1, weight=1)
        
        # 模式选择
        mode_frame = ttk.Frame(right_frame)
        mode_frame.pack(fill=tk.X, pady=5)
        self.mode_var = tk.StringVar(value="file")
        ttk.Radiobutton(mode_frame, text="单文件", variable=self.mode_var, 
                       value="file", command=self._toggle_mode).pack(side=tk.LEFT, padx=5)
        ttk.Radiobutton(mode_frame, text="目录", variable=self.mode_var, 
                       value="dir", command=self._toggle_mode).pack(side=tk.LEFT, padx=5)
        
        # 文件选择
        file_frame = ttk.Frame(right_frame)
        file_frame.pack(fill=tk.X, pady=5)
        self.path_var = tk.StringVar()
        ttk.Entry(file_frame, textvariable=self.path_var, width=40).pack(side=tk.LEFT, fill=tk.X, expand=True)
        ttk.Button(file_frame, text="浏览...", command=self._browse).pack(side=tk.LEFT, padx=5)
        
        # 目录选项
        self.dir_options = ttk.Frame(right_frame)
        self.dir_options.pack(fill=tk.X, pady=5)
        ttk.Label(self.dir_options, text="文件模式:").pack(side=tk.LEFT)
        self.pattern_var = tk.StringVar(value="*.log")
        ttk.Entry(self.dir_options, textvariable=self.pattern_var, width=15).pack(side=tk.LEFT, padx=5)
        self.recursive_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(self.dir_options, text="递归子目录", variable=self.recursive_var).pack(side=tk.LEFT)
        
        # 导出设置
        export_frame = ttk.LabelFrame(right_frame, text="导出设置", padding="5")
        export_frame.pack(fill=tk.X, pady=10)
        ttk.Label(export_frame, text="格式:").pack(side=tk.LEFT)
        self.format_var = tk.StringVar(value="text")
        ttk.Combobox(export_frame, textvariable=self.format_var, 
                    values=["text", "json", "csv"], width=10, state="readonly").pack(side=tk.LEFT, padx=5)
        
        ttk.Label(export_frame, text="输出:").pack(side=tk.LEFT, padx=(10,0))
        self.output_var = tk.StringVar(value="./output/result.log")
        ttk.Entry(export_frame, textvariable=self.output_var, width=25).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        ttk.Button(export_frame, text="...", command=self._browse_output, width=3).pack(side=tk.LEFT)
        
        # 操作按钮
        btn_frame = ttk.Frame(right_frame)
        btn_frame.pack(fill=tk.X, pady=10)
        self.start_btn = ttk.Button(btn_frame, text="开始分析", command=self._start_analysis)
        self.start_btn.pack(fill=tk.X, pady=2)
        ttk.Button(btn_frame, text="保存配置", command=self._save_config_from_ui).pack(fill=tk.X, pady=2)
        ttk.Button(btn_frame, text="重新加载配置", command=self._load_config_to_ui).pack(fill=tk.X, pady=2)
        
        # 进度条
        self.progress = ttk.Progressbar(right_frame, mode='determinate')
        self.progress.pack(fill=tk.X, pady=5)
        self.status_var = tk.StringVar(value="就绪")
        ttk.Label(right_frame, textvariable=self.status_var, wraplength=300).pack(fill=tk.X)
        
        # 统计信息
        self.stats_text = tk.Text(right_frame, height=10, wrap=tk.WORD, state=tk.DISABLED)
        self.stats_text.pack(fill=tk.BOTH, expand=True, pady=5)
        
        # 底部日志区域
        log_frame = ttk.LabelFrame(main_frame, text="分析日志", padding="5")
        log_frame.grid(row=1, column=0, columnspan=2, sticky=(tk.W, tk.E, tk.N, tk.S), pady=10)
        main_frame.rowconfigure(1, weight=1)
        
        self.log_area = scrolledtext.ScrolledText(log_frame, height=8, wrap=tk.WORD)
        self.log_area.pack(fill=tk.BOTH, expand=True)
    
    def _build_time_frame(self, parent):
        """构建时间段筛选UI"""
        time_frame = ttk.LabelFrame(parent, text="时间段筛选", padding="5")
        time_frame.pack(fill=tk.X, pady=5)
        
        # 启用复选框
        self.time_enabled_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(time_frame, text="启用时间筛选", variable=self.time_enabled_var,
                       command=self._toggle_time_inputs).pack(anchor=tk.W)
        
        # 时间输入框
        self.time_inputs_frame = ttk.Frame(time_frame)
        self.time_inputs_frame.pack(fill=tk.X, pady=5)
        
        # 开始时间
        ttk.Label(self.time_inputs_frame, text="开始时间:").grid(row=0, column=0, sticky=tk.W)
        self.start_time_var = tk.StringVar()
        self.start_time_entry = ttk.Entry(self.time_inputs_frame, textvariable=self.start_time_var, width=25)
        self.start_time_entry.grid(row=0, column=1, padx=5)
        ttk.Button(self.time_inputs_frame, text="现在", width=6,
                  command=lambda: self._set_relative_time(self.start_time_var, "0m")).grid(row=0, column=2)
        
        # 结束时间
        ttk.Label(self.time_inputs_frame, text="结束时间:").grid(row=1, column=0, sticky=tk.W, pady=5)
        self.end_time_var = tk.StringVar()
        self.end_time_entry = ttk.Entry(self.time_inputs_frame, textvariable=self.end_time_var, width=25)
        self.end_time_entry.grid(row=1, column=1, padx=5, pady=5)
        ttk.Button(self.time_inputs_frame, text="现在", width=6,
                  command=lambda: self._set_relative_time(self.end_time_var, "0m")).grid(row=1, column=2)
        
        # 快速选择按钮
        quick_frame = ttk.Frame(time_frame)
        quick_frame.pack(fill=tk.X, pady=2)
        ttk.Label(quick_frame, text="快速:").pack(side=tk.LEFT)
        ttk.Button(quick_frame, text="最近1小时", width=10,
                  command=lambda: self._set_quick_range(1, 'h')).pack(side=tk.LEFT, padx=2)
        ttk.Button(quick_frame, text="最近24小时", width=10,
                  command=lambda: self._set_quick_range(24, 'h')).pack(side=tk.LEFT, padx=2)
        ttk.Button(quick_frame, text="最近7天", width=10,
                  command=lambda: self._set_quick_range(7, 'd')).pack(side=tk.LEFT, padx=2)
        
        # 时间格式
        format_frame = ttk.Frame(time_frame)
        format_frame.pack(fill=tk.X, pady=2)
        ttk.Label(format_frame, text="时间格式:").pack(side=tk.LEFT)
        self.time_format_var = tk.StringVar(value="%Y-%m-%d %H:%M:%S")
        self.time_format_combo = ttk.Combobox(format_frame, textvariable=self.time_format_var, width=20)
        self.time_format_combo['values'] = (
            '%Y-%m-%d %H:%M:%S',
            '%Y-%m-%d %H:%M',
            '%Y-%m-%d',
            '%d/%m/%Y %H:%M:%S',
            '%H:%M:%S',
            '%b %d %H:%M:%S'
        )
        self.time_format_combo.pack(side=tk.LEFT, padx=5)
        
        self.auto_detect_time_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(format_frame, text="自动检测", variable=self.auto_detect_time_var).pack(side=tk.LEFT)
        
        # 提示标签
        hint_text = "提示: 支持绝对时间(2024-01-01 12:00:00)或相对时间(-1h, -30m, -1d)"
        ttk.Label(time_frame, text=hint_text, font=('', 8), foreground='gray').pack(anchor=tk.W)
        
        self._toggle_time_inputs()
    
    def _toggle_time_inputs(self):
        """启用/禁用时间输入"""
        state = 'normal' if self.time_enabled_var.get() else 'disabled'
        for child in self.time_inputs_frame.winfo_children():
            if isinstance(child, (ttk.Entry, ttk.Button)):
                child.configure(state=state)
        self.time_format_combo.configure(state='readonly' if self.time_enabled_var.get() else 'disabled')
    
    def _set_relative_time(self, var, relative):
        """设置相对时间"""
        var.set(f"-{relative}" if not relative.startswith('-') else relative)
    
    def _set_quick_range(self, value, unit):
        """设置快速时间范围"""
        self.time_enabled_var.set(True)
        self._toggle_time_inputs()
        self.start_time_var.set(f"-{value}{unit}")
        self.end_time_var.set("-0m")  # 现在
    
    def _toggle_mode(self):
        if self.mode_var.get() == "file":
            self.dir_options.pack_forget()
        else:
            self.dir_options.pack(fill=tk.X, pady=5, after=self.root.nametowidget('.!frame.!labelframe2.!frame'))
    
    def _browse(self):
        if self.mode_var.get() == "file":
            path = filedialog.askopenfilename(filetypes=[("日志文件", "*.log"), ("所有文件", "*.*")])
        else:
            path = filedialog.askdirectory()
        if path:
            self.path_var.set(path)
            if self.mode_var.get() == "file":
                default_out = os.path.join("./output", os.path.basename(path) + ".analysis.log")
            else:
                default_out = "./output/analysis_result.log"
            self.output_var.set(default_out)
    
    def _browse_output(self):
        path = filedialog.asksaveasfilename(
            defaultextension=".log",
            filetypes=[("日志文件", "*.log"), ("JSON文件", "*.json"), ("CSV文件", "*.csv"), ("所有文件", "*.*")]
        )
        if path:
            self.output_var.set(path)
    
    def _load_config_to_ui(self):
        config = self.config_manager.load_config()
        
        # 加载时间配置
        time_config = config.get('time_range', {})
        self.time_enabled_var.set(time_config.get('enabled', False))
        self.start_time_var.set(time_config.get('start_time', ''))
        self.end_time_var.set(time_config.get('end_time', ''))
        self.time_format_var.set(time_config.get('time_format', '%Y-%m-%d %H:%M:%S'))
        self.auto_detect_time_var.set(time_config.get('auto_detect_format', True))
        
        # 加载日志级别
        levels = config.get('log_levels', [])
        for lvl, var in self.level_vars.items():
            var.set(lvl in levels)
        
        # 加载关键字
        keywords = config.get('keywords', [])
        self.keywords_text.delete('1.0', tk.END)
        self.keywords_text.insert('1.0', '\n'.join(keywords))
        
        # 加载正则
        regexes = config.get('regex_patterns', [])
        self.regex_text.delete('1.0', tk.END)
        self.regex_text.insert('1.0', '\n'.join(regexes))
        
        # 加载排除模式
        excludes = config.get('exclude_patterns', [])
        self.exclude_text.delete('1.0', tk.END)
        self.exclude_text.insert('1.0', '\n'.join(excludes))
        
        # 加载设置
        settings = config.get('settings', {})
        self.pattern_var.set(settings.get('file_pattern', '*.log'))
        self.recursive_var.set(settings.get('recursive', True))
        
        self._toggle_time_inputs()
        self._log("配置已加载")
    
    def _save_config_from_ui(self):
        config = {
            'log_levels': [lvl for lvl, var in self.level_vars.items() if var.get()],
            'keywords': [k.strip() for k in self.keywords_text.get('1.0', tk.END).strip().split('\n') if k.strip()],
            'regex_patterns': [r.strip() for r in self.regex_text.get('1.0', tk.END).strip().split('\n') if r.strip()],
            'exclude_patterns': [e.strip() for e in self.exclude_text.get('1.0', tk.END).strip().split('\n') if e.strip()],
            'timestamp_pattern': r"\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}",
            'log_level_pattern': r"\b(DEBUG|INFO|WARNING|ERROR|CRITICAL)\b",
            'time_range': {
                'enabled': self.time_enabled_var.get(),
                'start_time': self.start_time_var.get(),
                'end_time': self.end_time_var.get(),
                'time_format': self.time_format_var.get(),
                'auto_detect_format': self.auto_detect_time_var.get()
            },
            'settings': {
                'file_pattern': self.pattern_var.get(),
                'recursive': self.recursive_var.get(),
                'auto_save': True,
                'default_output_dir': "./output"
            }
        }
        self.config_manager.save_config(config)
        self._log("配置已保存")
    
    def _log(self, message: str):
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.log_area.insert(tk.END, f"[{timestamp}] {message}\n")
        self.log_area.see(tk.END)
        self.root.update_idletasks()
    
    def _update_stats(self, stats: Dict):
        self.stats_text.config(state=tk.NORMAL)
        self.stats_text.delete('1.0', tk.END)
        text = f"总处理行数: {stats['total_lines']}\n"
        text += f"匹配行数: {stats['matched_lines']}\n"
        text += f"时间过滤: {stats.get('time_filtered', 0)}\n"
        text += f"当前文件: {stats.get('current_file', 'N/A')}\n\n"
        if stats['by_level']:
            text += "级别统计:\n"
            for lvl, count in stats['by_level'].items():
                if count > 0:
                    text += f"  {lvl}: {count}\n"
        self.stats_text.insert('1.0', text)
        self.stats_text.config(state=tk.DISABLED)
    
    def _start_analysis(self):
        if self.is_analyzing:
            return
        
        input_path = self.path_var.get()
        if not input_path:
            messagebox.showerror("错误", "请选择输入文件或目录")
            return
        
        if not os.path.exists(input_path):
            messagebox.showerror("错误", "输入路径不存在")
            return
        
        # 构建配置
        config = {
            'log_levels': [lvl for lvl, var in self.level_vars.items() if var.get()],
            'keywords': [k.strip() for k in self.keywords_text.get('1.0', tk.END).strip().split('\n') if k.strip()],
            'regex_patterns': [r.strip() for r in self.regex_text.get('1.0', tk.END).strip().split('\n') if r.strip()],
            'exclude_patterns': [e.strip() for e in self.exclude_text.get('1.0', tk.END).strip().split('\n') if e.strip()],
            'error_patterns': self.current_config.get('error_patterns', []),
            'timestamp_pattern': r"\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}",
            'log_level_pattern': r"\b(DEBUG|INFO|WARNING|ERROR|CRITICAL)\b",
            'time_range': {
                'enabled': self.time_enabled_var.get(),
                'start_time': self.start_time_var.get(),
                'end_time': self.end_time_var.get(),
                'time_format': self.time_format_var.get(),
                'auto_detect_format': self.auto_detect_time_var.get()
            }
        }
        
        # 验证时间格式
        if config['time_range']['enabled']:
            tf = TimeRangeFilter(config)
            if not tf.start_dt and config['time_range']['start_time']:
                messagebox.showerror("错误", f"无法解析开始时间: {config['time_range']['start_time']}\n请检查时间格式")
                return
            if not tf.end_dt and config['time_range']['end_time']:
                messagebox.showerror("错误", f"无法解析结束时间: {config['time_range']['end_time']}\n请检查时间格式")
                return
            self._log(f"时间筛选: {tf.get_description()}")
        
        if not config['log_levels'] and not config['keywords'] and not config['regex_patterns']:
            if not messagebox.askyesno("警告", "未设置任何过滤条件，将处理所有日志行，是否继续？"):
                return
        
        output_path = self.output_var.get()
        os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
        
        self.is_analyzing = True
        self.start_btn.config(state=tk.DISABLED)
        self.progress['value'] = 0
        self.log_area.delete('1.0', tk.END)
        
        thread = threading.Thread(target=self._analysis_worker, 
                                args=(input_path, config, output_path))
        thread.daemon = True
        thread.start()
    
    def _analysis_worker(self, input_path: str, config: Dict, output_path: str):
        try:
            analyzer = LogAnalyzerEngine(config)
            entries = []
            
            # 显示时间筛选信息
            if analyzer.time_filter.enabled:
                self._log(f"时间范围: {analyzer.time_filter.get_description()}")
            
            if os.path.isdir(input_path):
                self._log(f"开始分析目录: {input_path}")
                path = Path(input_path)
                pattern = self.pattern_var.get()
                recursive = self.recursive_var.get()
                
                if recursive:
                    files = list(path.rglob(pattern))
                else:
                    files = list(path.glob(pattern))
                
                self._log(f"找到 {len(files)} 个文件")
                
                for i, file_path in enumerate(files, 1):
                    self._log(f"[{i}/{len(files)}] 分析: {file_path}")
                    def progress(line, total, filepath):
                        self.status_var.set(f"正在分析: {os.path.basename(filepath)} ({line} 行)")
                        self.root.after(0, lambda: self._update_stats(analyzer.stats))
                    
                    file_entries = analyzer.analyze_file(str(file_path), progress)
                    entries.extend(file_entries)
                    self._log(f"  匹配 {len(file_entries)} 条记录")
                    
                    progress_pct = (i / len(files)) * 100
                    self.root.after(0, lambda p=progress_pct: self.progress.config(value=p))
            else:
                self._log(f"开始分析文件: {input_path}")
                def progress(line, total, filepath):
                    self.status_var.set(f"已处理 {line} 行")
                    self.root.after(0, lambda: self._update_stats(analyzer.stats))
                
                entries = analyzer.analyze_file(input_path, progress)
                self._log(f"分析完成，匹配 {len(entries)} 条记录")
                self.root.after(0, lambda: self.progress.config(value=100))
            
            self._log(f"正在导出到: {output_path}")
            self._export_results(entries, output_path, self.format_var.get())
            
            time_filtered = analyzer.stats.get('time_filtered', 0)
            self._log(f"完成！总处理: {analyzer.stats['total_lines']} 行, 时间过滤: {time_filtered}, 最终匹配: {len(entries)}")
            self.root.after(0, lambda: messagebox.showinfo("完成", 
                f"分析完成！\n总处理行数: {analyzer.stats['total_lines']}\n时间过滤: {time_filtered}\n最终匹配: {len(entries)}\n结果已保存至: {output_path}"))
            
        except Exception as e:
            self._log(f"错误: {str(e)}")
            import traceback
            self._log(traceback.format_exc())
            self.root.after(0, lambda: messagebox.showerror("错误", str(e)))
        finally:
            self.is_analyzing = False
            self.root.after(0, lambda: self.start_btn.config(state=tk.NORMAL))
            self.root.after(0, lambda: self.status_var.set("就绪"))
    
    def _export_results(self, entries: List[LogEntry], output_path: str, format_type: str):
        if format_type == "json":
            self._export_json(entries, output_path)
        elif format_type == "csv":
            self._export_csv(entries, output_path)
        else:
            self._export_text(entries, output_path)
    
    def _export_text(self, entries: List[LogEntry], output_path: str):
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(f"日志分析报告 - 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            if entries and entries[0].parsed_time:
                f.write(f"时间范围筛选: {self.time_enabled_var.get()}\n")
            f.write("=" * 80 + "\n\n")
            
            current_file = None
            for entry in entries:
                if entry.source_file != current_file:
                    current_file = entry.source_file
                    f.write(f"\n[文件: {current_file}]\n")
                    f.write("-" * 40 + "\n")
                
                timestamp = entry.timestamp or "N/A"
                level = entry.level.value if entry.level else "UNKNOWN"
                f.write(f"[{timestamp}] [{level}] 行{entry.line_number}\n")
                f.write(f"匹配规则: {', '.join(entry.matched_by)}\n")
                f.write(f"内容: {entry.message}\n")
                f.write("-" * 40 + "\n")
    
    def _export_json(self, entries: List[LogEntry], output_path: str):
        data = {
            'generated_at': datetime.now().isoformat(),
            'total_entries': len(entries),
            'time_filter_enabled': self.time_enabled_var.get(),
            'entries': [entry.to_dict() for entry in entries]
        }
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    
    def _export_csv(self, entries: List[LogEntry], output_path: str):
        import csv
        with open(output_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['timestamp', 'level', 'line_number', 'source_file', 'matched_by', 'message'])
            for entry in entries:
                writer.writerow([
                    entry.timestamp or '',
                    entry.level.value if entry.level else '',
                    entry.line_number,
                    entry.source_file,
                    ';'.join(entry.matched_by),
                    entry.message
                ])


def main():
    root = tk.Tk()
    app = LogAnalyzerGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()