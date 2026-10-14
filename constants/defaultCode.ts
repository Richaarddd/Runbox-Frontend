export const LANGUAGES = [
  { id: "python", label: "Python", monaco: "python", filename: "main.py", exts: [".py"] },
  { id: "cpp", label: "C++", monaco: "cpp", filename: "main.cpp", exts: [".cpp", ".cc", ".cxx"] },
  { id: "java", label: "Java", monaco: "java", filename: "Main.java", exts: [".java"] },
];

export const DEFAULT_CODE: Record<string, string> = {
  python: `name = input("What's your name? ")
print(f"Hello, {name}!")
`,
  cpp: `#include <iostream>
#include <string>
using namespace std;

int main() {
    string name;
    cout << "What's your name? ";
    getline(cin, name);
    cout << "Hello, " << name << "!" << endl;
    return 0;
}
`,
  java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.print("What's your name? ");
        String name = sc.nextLine();
        System.out.println("Hello, " + name + "!");
    }
}
`,
};