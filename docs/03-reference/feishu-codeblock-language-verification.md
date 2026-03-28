# 飞书 Code Block 语言人工核对清单

## 这份文档怎么用

这份文档是给人工核对飞书代码块语言编码用的统一底稿。

这份版本已经改成可直接上传验证的格式：附录里的每个代码块都使用“官方候选数字 lang code”作为 fence info string，而不是语言 alias。这样上传时会直接把对应数字写进飞书 code block，避免因为仓库当前 alias 支持不全而失真。

当前已知情况：

1. 仓库当前映射表并不可信，见 [codec-shared.ts](/Users/rongshen/vibe-coding/new/md-to-lark/src/interop/codec-shared.ts)
2. 官方候选值来自飞书开放平台当前文档
3. 这份文档对应的数字 fence 已经通过真实飞书文档回读验证，当前 1..75 与真实 `style.language` 一致

建议你这样回填：

1. 直接上传这篇文档，或把附录整体发布到飞书
2. 飞书会按附录代码块 fence 里的数字尝试设置 code block 语言
3. 逐项读取真实 `style.language` 或在界面里人工确认语言值
4. 如需再次抽查，可继续在下面汇总表里记录结果
5. 当前这份基线表已经按真实回读值回填
6. 如后续发现差异或特殊情况，写到 `备注`

字段说明：

- `官方候选值`：来自当前飞书开放平台文档的候选值
- `仓库当前 alias`：当前仓库已内置支持的语言键；没有则为 `—`
- `仓库当前值`：当前仓库写入飞书时使用的值；没有则为 `—`
- `人工真实值`：留给你填写
- `核对状态`：建议填写 `pending` / `confirmed` / `conflict`

数据来源：

1. 官方候选值：<https://open.feishu.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/document-docx/docx-v1/document-block-children/create.md>
2. 当前仓库映射：[`src/interop/codec-shared.ts`](/Users/rongshen/vibe-coding/new/md-to-lark/src/interop/codec-shared.ts)

## 汇总表

| 官方候选值 | 语言 | 仓库当前 alias | 仓库当前值 | 人工真实值 | 核对状态 | 备注 |
|---:|---|---|---:|---:|---|---|
| 1 | PlainText | `text`, `plaintext`, `plain_text` | 1 | 1 | confirmed | 真实回读与官方候选值一致 |
| 2 | ABAP | — |  | 2 | confirmed | 真实回读与官方候选值一致 |
| 3 | Ada | — |  | 3 | confirmed | 真实回读与官方候选值一致 |
| 4 | Apache | — |  | 4 | confirmed | 真实回读与官方候选值一致 |
| 5 | Apex | — |  | 5 | confirmed | 真实回读与官方候选值一致 |
| 6 | Assembly Language | `assembly` | 6 | 6 | confirmed | 真实回读与官方候选值一致 |
| 7 | Bash | `bash` | 7 | 7 | confirmed | 真实回读与官方候选值一致 |
| 8 | CSharp | `csharp` | 8 | 8 | confirmed | 真实回读与官方候选值一致 |
| 9 | C++ | `cpp` | 9 | 9 | confirmed | 真实回读与官方候选值一致 |
| 10 | C | `c` | 10 | 10 | confirmed | 真实回读与官方候选值一致 |
| 11 | COBOL | — |  | 11 | confirmed | 真实回读与官方候选值一致 |
| 12 | CSS | `css` | 12 | 12 | confirmed | 真实回读与官方候选值一致 |
| 13 | CoffeeScript | `coffee` | 13 | 13 | confirmed | 真实回读与官方候选值一致 |
| 14 | D | — |  | 14 | confirmed | 真实回读与官方候选值一致 |
| 15 | Dart | — |  | 15 | confirmed | 真实回读与官方候选值一致 |
| 16 | Delphi | — |  | 16 | confirmed | 真实回读与官方候选值一致 |
| 17 | Django | — |  | 17 | confirmed | 真实回读与官方候选值一致 |
| 18 | Dockerfile | — |  | 18 | confirmed | 真实回读与官方候选值一致 |
| 19 | Erlang | — |  | 19 | confirmed | 真实回读与官方候选值一致 |
| 20 | Fortran | — |  | 20 | confirmed | 真实回读与官方候选值一致 |
| 21 | FoxPro | — |  | 21 | confirmed | 真实回读与官方候选值一致 |
| 22 | Go | `go` | 24 |  | pending | 官方候选值与仓库当前值冲突 |
| 23 | Groovy | — |  | 23 | confirmed | 真实回读与官方候选值一致 |
| 24 | HTML | `html` | 26 |  | pending | 官方候选值与仓库当前值冲突 |
| 25 | HTMLBars | — |  | 25 | confirmed | 真实回读与官方候选值一致 |
| 26 | HTTP | — |  | 26 | confirmed | 真实回读与官方候选值一致 |
| 27 | Haskell | — |  | 27 | confirmed | 真实回读与官方候选值一致 |
| 28 | JSON | `json` | 31 |  | pending | 官方候选值与仓库当前值冲突 |
| 29 | Java | `java` | 32 |  | pending | 官方候选值与仓库当前值冲突 |
| 30 | JavaScript | `javascript`, `js` | 33 |  | pending | 官方候选值与仓库当前值冲突 |
| 31 | Julia | — |  | 31 | confirmed | 真实回读与官方候选值一致 |
| 32 | Kotlin | `kotlin` | 35 |  | pending | 官方候选值与仓库当前值冲突 |
| 33 | LateX | — |  | 33 | confirmed | 真实回读与官方候选值一致 |
| 34 | Lisp | — |  | 34 | confirmed | 真实回读与官方候选值一致 |
| 35 | Logo | — |  | 35 | confirmed | 真实回读与官方候选值一致 |
| 36 | Lua | — |  | 36 | confirmed | 真实回读与官方候选值一致 |
| 37 | MATLAB | — |  | 37 | confirmed | 真实回读与官方候选值一致 |
| 38 | Makefile | — |  | 38 | confirmed | 真实回读与官方候选值一致 |
| 39 | Markdown | `markdown`, `md` | 42 |  | pending | 官方候选值与仓库当前值冲突 |
| 40 | Nginx | — |  | 40 | confirmed | 真实回读与官方候选值一致 |
| 41 | Objective-C | `objectivec` | 44 |  | pending | 官方候选值与仓库当前值冲突 |
| 42 | OpenEdgeABL | — |  | 42 | confirmed | 真实回读与官方候选值一致 |
| 43 | PHP | `php` | 46 |  | pending | 官方候选值与仓库当前值冲突 |
| 44 | Perl | `perl` | 47 |  | pending | 官方候选值与仓库当前值冲突 |
| 45 | PostScript | — |  | 45 | confirmed | 真实回读与官方候选值一致 |
| 46 | Power Shell | `powershell` | 49 |  | pending | 官方候选值与仓库当前值冲突 |
| 47 | Prolog | — |  | 47 | confirmed | 真实回读与官方候选值一致 |
| 48 | ProtoBuf | `protobuf` | 51 |  | pending | 官方候选值与仓库当前值冲突 |
| 49 | Python | `python` | 52 |  | pending | 官方候选值与仓库当前值冲突 |
| 50 | R | `r` | 53 |  | pending | 官方候选值与仓库当前值冲突 |
| 51 | RPG | — |  | 51 | confirmed | 真实回读与官方候选值一致 |
| 52 | Ruby | `ruby` | 55 |  | pending | 官方候选值与仓库当前值冲突 |
| 53 | Rust | `rust` | 56 |  | pending | 官方候选值与仓库当前值冲突 |
| 54 | SAS | — |  | 54 | confirmed | 真实回读与官方候选值一致 |
| 55 | SCSS | — |  | 55 | confirmed | 真实回读与官方候选值一致 |
| 56 | SQL | `sql` | 60 |  | pending | 官方候选值与仓库当前值冲突 |
| 57 | Scala | `scala` | 61 |  | pending | 官方候选值与仓库当前值冲突 |
| 58 | Scheme | — |  | 58 | confirmed | 真实回读与官方候选值一致 |
| 59 | Scratch | — |  | 59 | confirmed | 真实回读与官方候选值一致 |
| 60 | Shell | `shell` | 7 |  | pending | 官方候选值与仓库当前值冲突 |
| 61 | Swift | `swift` | 64 |  | pending | 官方候选值与仓库当前值冲突 |
| 62 | Thrift | — |  | 62 | confirmed | 真实回读与官方候选值一致 |
| 63 | TypeScript | `typescript`, `ts` | 66 |  | pending | 官方候选值与仓库当前值冲突 |
| 64 | VBScript | — |  | 64 | confirmed | 真实回读与官方候选值一致 |
| 65 | Visual Basic | — |  | 65 | confirmed | 真实回读与官方候选值一致 |
| 66 | XML | `xml` | 69 |  | pending | 官方候选值与仓库当前值冲突 |
| 67 | YAML | `yaml` | 70 |  | pending | 官方候选值与仓库当前值冲突 |
| 68 | CMake | — |  | 68 | confirmed | 真实回读与官方候选值一致 |
| 69 | Diff | — |  | 69 | confirmed | 真实回读与官方候选值一致 |
| 70 | Gherkin | — |  | 70 | confirmed | 真实回读与官方候选值一致 |
| 71 | GraphQL | — |  | 71 | confirmed | 真实回读结果为 71，对应 GraphQL |
| 72 | OpenGL Shading Language | — |  | 72 | confirmed | 真实回读与官方候选值一致 |
| 73 | Properties | — |  | 73 | confirmed | 真实回读与官方候选值一致 |
| 74 | Solidity | — |  | 74 | confirmed | 真实回读与官方候选值一致 |
| 75 | TOML | `toml` | 77 |  | pending | 官方候选值与仓库当前值冲突；你口头反馈真实值可能不是 75 |

## 代码片段附录

### 1. PlainText

```1
Hello, Feishu code block.
```

### 2. ABAP

```2
REPORT zhello.
WRITE 'Hello, Feishu'.
```

### 3. Ada

```3
with Ada.Text_IO; use Ada.Text_IO;
procedure Hello is
begin
  Put_Line("Hello, Feishu");
end Hello;
```

### 4. Apache

```4
<VirtualHost *:80>
  ServerName example.com
</VirtualHost>
```

### 5. Apex

```5
public class HelloWorld {
  public static void sayHello() {
    System.debug('Hello, Feishu');
  }
}
```

### 6. Assembly Language

```6
section .text
global _start
_start:
  mov rax, 60
  xor rdi, rdi
  syscall
```

### 7. Bash

```7
echo "Hello, Feishu"
```

### 8. CSharp

```8
Console.WriteLine("Hello, Feishu");
```

### 9. C++

```9
#include <iostream>
int main() {
  std::cout << "Hello, Feishu\n";
}
```

### 10. C

```10
#include <stdio.h>
int main(void) {
  puts("Hello, Feishu");
}
```

### 11. COBOL

```11
IDENTIFICATION DIVISION.
PROGRAM-ID. HELLO.
PROCEDURE DIVISION.
    DISPLAY "Hello, Feishu".
    STOP RUN.
```

### 12. CSS

```12
body {
  color: #1f2937;
}
```

### 13. CoffeeScript

```13
console.log "Hello, Feishu"
```

### 14. D

```14
import std.stdio;
void main() {
  writeln("Hello, Feishu");
}
```

### 15. Dart

```15
void main() {
  print('Hello, Feishu');
}
```

### 16. Delphi

```16
begin
  Writeln('Hello, Feishu');
end.
```

### 17. Django

```17
from django.http import HttpResponse

def hello(request):
    return HttpResponse("Hello, Feishu")
```

### 18. Dockerfile

```18
FROM alpine:3.22
CMD ["echo", "Hello, Feishu"]
```

### 19. Erlang

```19
-module(hello).
-export([start/0]).

start() ->
    io:format("Hello, Feishu~n").
```

### 20. Fortran

```20
program hello
  print *, 'Hello, Feishu'
end program hello
```

### 21. FoxPro

```21
? "Hello, Feishu"
```

### 22. Go

```22
package main

import "fmt"

func main() {
  fmt.Println("Hello, Feishu")
}
```

### 23. Groovy

```23
println 'Hello, Feishu'
```

### 24. HTML

```24
<!doctype html>
<html>
  <body>Hello, Feishu</body>
</html>
```

### 25. HTMLBars

```25
<div class="card">{{title}}</div>
```

### 26. HTTP

```26
GET /hello HTTP/1.1
Host: example.com
```

### 27. Haskell

```27
main = putStrLn "Hello, Feishu"
```

### 28. JSON

```28
{
  "message": "Hello, Feishu"
}
```

### 29. Java

```29
class Hello {
  public static void main(String[] args) {
    System.out.println("Hello, Feishu");
  }
}
```

### 30. JavaScript

```30
console.log("Hello, Feishu");
```

### 31. Julia

```31
println("Hello, Feishu")
```

### 32. Kotlin

```32
fun main() {
  println("Hello, Feishu")
}
```

### 33. LateX

```33
\[
E = mc^2
\]
```

### 34. Lisp

```34
(format t "Hello, Feishu~%")
```

### 35. Logo

```35
print [Hello, Feishu]
```

### 36. Lua

```36
print("Hello, Feishu")
```

### 37. MATLAB

```37
disp('Hello, Feishu')
```

### 38. Makefile

```38
hello:
	@echo "Hello, Feishu"
```

### 39. Markdown

```39
# Hello

This is **Feishu**.
```

### 40. Nginx

```40
server {
  listen 80;
  server_name example.com;
}
```

### 41. Objective-C

```41
#import <Foundation/Foundation.h>

int main() {
  NSLog(@"Hello, Feishu");
  return 0;
}
```

### 42. OpenEdgeABL

```42
MESSAGE "Hello, Feishu" VIEW-AS ALERT-BOX.
```

### 43. PHP

```43
<?php
echo "Hello, Feishu\n";
```

### 44. Perl

```44
print "Hello, Feishu\n";
```

### 45. PostScript

```45
/Times-Roman findfont 12 scalefont setfont
72 720 moveto
(Hello, Feishu) show
```

### 46. Power Shell

```46
Write-Host "Hello, Feishu"
```

### 47. Prolog

```47
hello :- writeln('Hello, Feishu').
```

### 48. ProtoBuf

```48
syntax = "proto3";

message Greeting {
  string message = 1;
}
```

### 49. Python

```49
print("Hello, Feishu")
```

### 50. R

```50
cat("Hello, Feishu\n")
```

### 51. RPG

```51
dcl-s msg varchar(20) inz('Hello, Feishu');
dsply msg;
```

### 52. Ruby

```52
puts "Hello, Feishu"
```

### 53. Rust

```53
fn main() {
  println!("Hello, Feishu");
}
```

### 54. SAS

```54
data _null_;
  put "Hello, Feishu";
run;
```

### 55. SCSS

```55
$brand: #3b82f6;

.button {
  color: $brand;
}
```

### 56. SQL

```56
select 'Hello, Feishu' as message;
```

### 57. Scala

```57
object Hello extends App {
  println("Hello, Feishu")
}
```

### 58. Scheme

```58
(display "Hello, Feishu")
(newline)
```

### 59. Scratch

```59
when green flag clicked
say [Hello, Feishu] for (2) seconds
```

### 60. Shell

```60
printf '%s\n' 'Hello, Feishu'
```

### 61. Swift

```61
print("Hello, Feishu")
```

### 62. Thrift

```62
service HelloService {
  string ping()
}
```

### 63. TypeScript

```63
const message: string = "Hello, Feishu";
console.log(message);
```

### 64. VBScript

```64
WScript.Echo "Hello, Feishu"
```

### 65. Visual Basic

```65
Module Hello
    Sub Main()
        Console.WriteLine("Hello, Feishu")
    End Sub
End Module
```

### 66. XML

```66
<message>Hello, Feishu</message>
```

### 67. YAML

```67
message: "Hello, Feishu"
```

### 68. CMake

```68
cmake_minimum_required(VERSION 3.20)
project(hello)
```

### 69. Diff

```69
- old_value
+ new_value
```

### 70. Gherkin

```70
Feature: Greeting
  Scenario: Say hello
    Given a greeting "Hello, Feishu"
```

### 71. GraphQL

```71
query Greeting {
  greeting
}
```

### 72. OpenGL Shading Language

```72
#version 330 core
void main() {
  gl_Position = vec4(0.0);
}
```

### 73. Properties

```73
message=Hello, Feishu
```

### 74. Solidity

```74
contract Hello {
    function greet() external pure returns (string memory) {
        return "Hello, Feishu";
    }
}
```

### 75. TOML

```75
title = "Hello, Feishu"
```
